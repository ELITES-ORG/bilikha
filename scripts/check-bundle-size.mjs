#!/usr/bin/env node
/**
 * Fails when the first page load grows past its budget.
 *
 * Most of Bilikha's users are on budget Android over prepaid data
 * (docs/explanation/constraints.md), so what the first visit downloads is a
 * product constraint, not a nicety. Nothing measured it until the navy-and-red
 * restyle (#11) grew the initial JS by 2% and the CSS by 22% and no check
 * noticed. This measures it on every CI run.
 *
 * "The first page load" is exactly what the built `index.html` fetches before
 * any route renders: the entry script, the chunks it modulepreloads, and the
 * stylesheet. Lazy routes are not counted — they load when visited.
 *
 * Sizes are gzip, measured here rather than read from Vite's report, so the
 * number is the same on every machine. The budget lives in
 * frontend/bundle-budget.json; raising it is a visible change in its own pull
 * request, and `pr-audit` asks for a reason when it goes up (ADR 0043).
 *
 *   npm run build && npm run check:bundle
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(ROOT, 'frontend', 'dist');
const BUDGET_FILE = join(ROOT, 'frontend', 'bundle-budget.json');

/** The assets `index.html` loads up front, by kind. */
export function initialAssets(html) {
  const js = [];
  const css = [];
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const src = tag.match(/\b(?:src|href)="([^"]+)"/)?.[1];
    if (!src || !src.startsWith('/assets/')) continue;
    if (/^<script\b/.test(tag) && /type="module"/.test(tag)) js.push(src);
    else if (/rel="modulepreload"/.test(tag)) js.push(src);
    else if (/rel="stylesheet"/.test(tag)) css.push(src);
  }
  return { js, css };
}

export const gzipBytes = (buffer) => gzipSync(buffer, { level: 9 }).length;

/** Compares measured sizes with the budget; returns one line per breach. */
export function overBudget(measured, budget) {
  const problems = [];
  for (const [key, label] of [
    ['initialJsGzipBytes', 'Initial JS'],
    ['initialCssGzipBytes', 'Initial CSS'],
  ]) {
    if (typeof budget[key] !== 'number') {
      problems.push(`${label}: no budget set (${key} in frontend/bundle-budget.json)`);
    } else if (measured[key] > budget[key]) {
      problems.push(
        `${label} is ${kb(measured[key])} gzip, over its ${kb(budget[key])} budget by ${kb(measured[key] - budget[key])}`,
      );
    }
  }
  return problems;
}

const kb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;

function main() {
  let html;
  try {
    html = readFileSync(join(DIST, 'index.html'), 'utf8');
  } catch {
    console.error('frontend/dist/index.html not found — run `npm run build` first.');
    process.exit(2);
  }

  const { js, css } = initialAssets(html);
  const size = (paths) => paths.reduce((sum, p) => sum + gzipBytes(readFileSync(join(DIST, p))), 0);
  const measured = { initialJsGzipBytes: size(js), initialCssGzipBytes: size(css) };
  const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

  console.log(`Initial JS:  ${kb(measured.initialJsGzipBytes)} gzip (budget ${kb(budget.initialJsGzipBytes)}) — ${js.length} file(s)`);
  console.log(`Initial CSS: ${kb(measured.initialCssGzipBytes)} gzip (budget ${kb(budget.initialCssGzipBytes)}) — ${css.length} file(s)`);

  const problems = overBudget(measured, budget);
  if (problems.length === 0) return;

  console.error('\nThe first page load is over budget:');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error::${problem}`);
  }
  console.error(
    '\nShrink it, or raise frontend/bundle-budget.json in its own commit and give the reason in the\n' +
      'pull request as "Budget raised: <why>". See docs/guides/open-a-pull-request.md.',
  );
  process.exit(1);
}

const self = (path) => resolve(path).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) {
  main();
}
