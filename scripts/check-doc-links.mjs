#!/usr/bin/env node
/**
 * Verifies every relative markdown link resolves to a real file.
 *
 * Broken cross-references are how a documentation set loses trust: one dead
 * link and readers stop believing the rest. Cheap enough to run in CI.
 *
 *   node scripts/check-doc-links.mjs
 *
 * Exits 1 if anything is broken.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'drizzle', '.vite']);
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function collect(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, found);
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Fenced code blocks contain things that look like links but are not — a regex
 * such as `[a-z](?:x)` parses as markdown link syntax. Strip them before
 * scanning, preserving line count so reported line numbers stay accurate.
 */
function stripCodeFences(text) {
  let inFence = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

const files = collect(ROOT);
const broken = [];
let checked = 0;

for (const file of files) {
  const lines = stripCodeFences(readFileSync(file, 'utf8')).split('\n');

  lines.forEach((line, index) => {
    // Inline code can also contain link-shaped text.
    const scannable = line.replace(/`[^`]*`/g, '');

    for (const match of scannable.matchAll(LINK)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;

      const path = target.split('#')[0];
      if (!path) continue;

      checked += 1;
      if (!existsSync(normalize(resolve(dirname(file), path)))) {
        broken.push({ file: relative(ROOT, file), line: index + 1, target });
      }
    }
  });
}

console.log(`Scanned ${files.length} markdown files, ${checked} relative links.`);

if (broken.length > 0) {
  console.error(`\n${broken.length} broken link(s):\n`);
  for (const { file, line, target } of broken) {
    console.error(`  ${file}:${line}  ->  ${target}`);
  }
  process.exit(1);
}

console.log('All relative links resolve.');
