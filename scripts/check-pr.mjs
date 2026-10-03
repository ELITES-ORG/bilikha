#!/usr/bin/env node
/**
 * Fails a pull request that is not ready to be audited.
 *
 * Every pull request into main is audited before it merges (ADR 0043), and an
 * audit is only as quick as the evidence the pull request carries. The template
 * asks for that evidence; this checks it was given, and checks the diff for the
 * things a ticked box cannot prove — a schema change with no migration, a
 * lockfile that changed on its own, a `.env` file.
 *
 * It judges completeness, not quality. Whether the tests are good, the feature
 * correct and the reasoning in an exception sound is the audit's job.
 *
 * In CI (the `pr-audit` job), the description arrives in PR_BODY:
 *
 *   node scripts/check-pr.mjs --base <sha> --head <sha>
 *
 * Locally, before opening the pull request, with the description in a file:
 *
 *   npm run check:pr -- --body-file pr.md
 *
 * Exits 1 with every problem listed, not just the first.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Sections every description must fill in, as headed in the template. */
const REQUIRED_SECTIONS = [
  'What and why',
  'Acceptance criteria',
  'What changed',
  'How to verify',
  'Rollout',
  'Known gaps and risks',
  'Checklist',
];

/**
 * A deliberate exception is a line in the description, `<Label>: <reason>`.
 * The reason must say something — ten characters rules out "n/a" and "-" — and
 * the audit decides whether it holds. Without an escape, a strict rule gets
 * satisfied with an empty test, which is worse than an honest exception.
 */
const EXCEPTIONS = {
  tests: 'No tests',
  apiDocs: 'No API docs',
  migration: 'No migration',
  envDocs: 'No env docs',
  lockfile: 'Lockfile only',
  tooling: 'Tooling change',
  budget: 'Budget raised',
};

/** Paths that must never be committed. No exception: delete them. */
const FORBIDDEN = [
  { pattern: /(^|\/)\.env(\.(?!example$)[^/]+)?$/, why: 'an environment file — secrets live in host dashboards only' },
  { pattern: /^tmp\//, why: 'scratch output from a verification run' },
  { pattern: /(^|\/)tmp-[^/]*$/, why: 'a scratch file from manual API testing' },
  { pattern: /\.cookies$|(^|\/)cookies\.txt$/, why: 'a cookie jar — a session cookie is a credential' },
];

const isTest = (path) => /\.test\.(ts|tsx|mjs|js)$/.test(path) || path.startsWith('backend/src/test/');
const isAppCode = (path) => /^(backend|frontend)\/src\/.+\.(ts|tsx)$/.test(path) && !isTest(path);
const isUi = (path) => /^frontend\/src\/.+\.(tsx|css)$/.test(path) && !isTest(path);
const isRoutes = (path) => /^backend\/src\/(.+\.routes\.ts|routes\/.+\.ts)$/.test(path) && !isTest(path);

/**
 * The repository's own machinery: agent configuration and instructions, git
 * hooks, CI, repo scripts, and the root package.json that runs them. A change
 * here alters how everyone works, so it should not ride along inside a feature.
 * Found in #11, where a local tool's hooks, MCP config and a CLAUDE.md section
 * arrived inside a restyle.
 */
const isTooling = (path) =>
  /^(\.claude\/|\.mcp\.json$|\.githooks\/|\.github\/|scripts\/|CLAUDE\.md$|package\.json$|CODEOWNERS$)/.test(path);
const isProduct = (path) =>
  /^(backend\/(src|drizzle)\/|frontend\/(src|public)\/|frontend\/index\.html$)/.test(path);

/** Sections whose ticked boxes are claims that something was done. */
const CLAIM_SECTIONS = ['Acceptance criteria', 'States checked', 'Rollout', 'Checklist'];

/**
 * A ticked box whose own note says the thing was not done. Deliberately a short
 * list of unambiguous phrasings rather than anything clever — it catches the
 * honest contradiction ("signed in not yet checked"), and the audit catches the
 * rest. Found in #11, where every state was ticked and half the notes said
 * otherwise.
 */
const NOT_DONE =
  /\bnot (?:yet )?(?:been )?(?:checked|tested|verified|seen|opened|captured|looked at|run|tried)\b|\bstill (?:needs?|to do)\b|\bTODO\b|\bTBD\b/i;

/**
 * Fields npm uses to pick a platform's native binary. An npm that does not know
 * one drops it when it rewrites the lockfile, and the diff looks harmless — #11
 * stripped `libc` from 26 entries that way.
 */
const PLATFORM_FIELDS = ['libc', 'os', 'cpu'];

export const BUDGET_FILE = 'frontend/bundle-budget.json';

/** Removes template guidance so an untouched template reads as empty. */
function stripComments(body) {
  return body.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
}

/** `## Heading` → its text, up to the next `## `. */
function sections(body) {
  const map = new Map();
  const parts = body.split(/^## +/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const title = (newline === -1 ? part : part.slice(0, newline)).trim();
    map.set(title.toLowerCase(), newline === -1 ? '' : part.slice(newline + 1));
  }
  return map;
}

/**
 * Whether a section says anything. Template scaffolding — an empty list item,
 * a bare `1.`, an empty checkbox, a label with nothing after it — does not.
 */
function hasContent(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .some((line) => {
      if (line === '') return false;
      if (/^(-|\*|\d+\.)$/.test(line)) return false;
      if (/^- \[[ xX]\]$/.test(line)) return false;
      if (/^[^:]{1,40}:$/.test(line.replace(/\*\*/g, ''))) return false;
      return true;
    });
}

function exceptionReason(body, label) {
  const match = body.match(new RegExp(`^\\s*(?:[-*]\\s+)?${label}:\\s*(.+)$`, 'im'));
  return match && match[1].trim().length >= 10 ? match[1].trim() : null;
}

/**
 * The whole rule set, pure so it can be tested: a description, a list of
 * `{ status, path }` from `git diff --name-status`, and — for the few rules that
 * read inside a file — `contents[path] = { before, after }`; a list of problems
 * out.
 */
export function auditPullRequest({ body, files, contents = {} }) {
  const problems = [];
  const text = stripComments(body ?? '');
  const byTitle = sections(text);
  const changed = files.filter((file) => file.status !== 'D').map((file) => file.path);
  const touched = files.map((file) => file.path);

  // --- the description ----------------------------------------------------

  for (const title of REQUIRED_SECTIONS) {
    const content = byTitle.get(title.toLowerCase());
    if (content === undefined) {
      problems.push(`Description: the "${title}" section is missing. Start from the template.`);
    } else if (!hasContent(content)) {
      problems.push(`Description: the "${title}" section is empty.`);
    }
  }

  const plan = text.match(/^\s*Plan \/ issue:[ \t]*(.*)$/im);
  if (!plan || plan[1].trim() === '') {
    problems.push('Description: "Plan / issue:" is blank. Link the plan or issue, or write "none" and why.');
  }

  const criteria = byTitle.get('acceptance criteria') ?? '';
  if (byTitle.has('acceptance criteria') && !/^\s*- \[[ xX]\] +\S/m.test(criteria)) {
    problems.push('Description: "Acceptance criteria" has no checkable item (`- [ ] …`).');
  }

  const layers = byTitle.get('what changed') ?? '';
  for (const match of layers.matchAll(/^\s*- \*\*([^*]+?):\*\*[ \t]*(.*)$/gm)) {
    if (match[2].trim() === '') {
      problems.push(`Description: "What changed" leaves **${match[1]}** blank. Write "none" if it is untouched.`);
    }
  }

  for (const title of ['Rollout', 'Checklist']) {
    const content = byTitle.get(title.toLowerCase());
    if (content && /^\s*- \[ \]/m.test(content)) {
      problems.push(`Description: "${title}" has unticked boxes. Do the work, or explain in "Known gaps and risks".`);
    }
  }

  for (const title of CLAIM_SECTIONS) {
    const content = byTitle.get(title.toLowerCase()) ?? '';
    for (const line of content.split('\n')) {
      if (/^\s*- \[[xX]\]/.test(line) && NOT_DONE.test(line)) {
        const claim = line.replace(/^\s*- \[[xX]\]\s*/, '').trim();
        problems.push(
          `Description: "${title}" ticks a box its own note says was not done — "${claim.slice(0, 120)}". ` +
            'Untick it, or do it.',
        );
      }
    }
  }

  // --- what only a screen change needs ------------------------------------

  if (changed.some(isUi)) {
    const states = byTitle.get('states checked');
    if (states === undefined) {
      problems.push('Description: this changes the UI, so "States checked" is required.');
    } else {
      const open = states.split('\n').filter((line) => /^\s*- \[ \]/.test(line) && !/n\/a/i.test(line));
      if (open.length > 0) {
        problems.push(
          `Description: "States checked" has ${open.length} unchecked state(s). Check them, or mark a line "n/a" with why.`,
        );
      }
    }

    const shots = byTitle.get('screenshots') ?? '';
    if (!/!\[[^\]]*\]\(|<img\s/i.test(shots)) {
      problems.push('Description: this changes the UI, so "Screenshots" needs at least one image.');
    }
  }

  // --- the diff ------------------------------------------------------------

  for (const path of changed) {
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(path)) problems.push(`Diff: ${path} must not be committed — ${why}.`);
    }
  }

  for (const lock of changed.filter((path) => path.endsWith('package-lock.json'))) {
    const manifest = lock.replace(/package-lock\.json$/, 'package.json');
    if (!touched.includes(manifest) && !exceptionReason(text, EXCEPTIONS.lockfile)) {
      problems.push(
        `Diff: ${lock} changed but ${manifest} did not. Revert it (git checkout origin/main -- ${lock}), ` +
          `or add "${EXCEPTIONS.lockfile}: <why>" for a deliberate update.`,
      );
    }
  }

  for (const lock of changed.filter((path) => path.endsWith('package-lock.json'))) {
    const { before, after } = contents[lock] ?? {};
    if (before === undefined || after === undefined) continue;
    let stripped;
    try {
      stripped = strippedPlatformFields(JSON.parse(before), JSON.parse(after));
    } catch {
      problems.push(`Diff: ${lock} is not valid JSON.`);
      continue;
    }
    if (stripped.length > 0) {
      const names = stripped.slice(0, 3).map(({ name, field }) => `${name} (${field})`).join(', ');
      problems.push(
        `Diff: ${lock} drops platform fields from ${stripped.length} package(s) that are still installed — ` +
          `${names}${stripped.length > 3 ? ', …' : ''}. Your npm rewrote the lockfile without them; ` +
          'restore it from main and apply only the dependency change.',
      );
    }
  }

  const tooling = changed.filter(isTooling);
  if (tooling.length > 0 && changed.some(isProduct) && !exceptionReason(text, EXCEPTIONS.tooling)) {
    problems.push(
      `Diff: this changes the repository's own tooling (${tooling.slice(0, 4).join(', ')}` +
        `${tooling.length > 4 ? ', …' : ''}) alongside the product. Move it to its own pull request, ` +
        `or add "${EXCEPTIONS.tooling}: <why it belongs here>".`,
    );
  }

  if (contents[BUDGET_FILE]) {
    const { before, after } = contents[BUDGET_FILE];
    if (before !== undefined && after === undefined) {
      if (!exceptionReason(text, EXCEPTIONS.budget)) {
        problems.push(`Diff: ${BUDGET_FILE} is deleted. Keep it, or add "${EXCEPTIONS.budget}: <why>".`);
      }
    } else if (before !== undefined && after !== undefined) {
      const raised = raisedBudgets(before, after);
      if (raised.length > 0 && !exceptionReason(text, EXCEPTIONS.budget)) {
        problems.push(
          `Diff: ${BUDGET_FILE} raises ${raised.join(', ')}. Say why with "${EXCEPTIONS.budget}: <why>" — ` +
            'what the first page load gained, and why it cannot be lazy-loaded.',
        );
      }
    }
  }

  if (changed.some(isAppCode) && !touched.some(isTest) && !exceptionReason(text, EXCEPTIONS.tests)) {
    problems.push(`Diff: application code changed and no test did. Add a test, or "${EXCEPTIONS.tests}: <why>".`);
  }

  if (
    touched.some((path) => path.startsWith('backend/src/db/schema/')) &&
    !changed.some((path) => path.startsWith('backend/drizzle/')) &&
    !exceptionReason(text, EXCEPTIONS.migration)
  ) {
    problems.push(
      `Diff: the database schema changed with no migration in backend/drizzle/. Run db:generate, ` +
        `or add "${EXCEPTIONS.migration}: <why>".`,
    );
  }

  if (
    touched.some(isRoutes) &&
    !touched.includes('docs/reference/api.md') &&
    !exceptionReason(text, EXCEPTIONS.apiDocs)
  ) {
    problems.push(
      `Diff: API routes changed and docs/reference/api.md did not. Update it, or add "${EXCEPTIONS.apiDocs}: <why>".`,
    );
  }

  if (
    touched.includes('backend/src/config/env.ts') &&
    !(touched.includes('backend/.env.example') && touched.includes('docs/reference/environment.md')) &&
    !exceptionReason(text, EXCEPTIONS.envDocs)
  ) {
    problems.push(
      'Diff: backend/src/config/env.ts changed without both backend/.env.example and ' +
        `docs/reference/environment.md. Update them, or add "${EXCEPTIONS.envDocs}: <why>".`,
    );
  }

  return problems;
}

/** Packages present in both lockfiles that had a platform field before and lost it. */
export function strippedPlatformFields(before, after) {
  const found = [];
  for (const [name, entry] of Object.entries(before.packages ?? {})) {
    const next = after.packages?.[name];
    if (!next) continue;
    for (const field of PLATFORM_FIELDS) {
      if (entry[field] !== undefined && next[field] === undefined) found.push({ name, field });
    }
  }
  return found;
}

/** Budget keys whose number went up, or that vanished. */
export function raisedBudgets(beforeText, afterText) {
  let before;
  let after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return ['the budget (it is not valid JSON)'];
  }
  return Object.keys(before)
    .filter((key) => typeof before[key] === 'number')
    .filter((key) => typeof after[key] !== 'number' || after[key] > before[key]);
}

/** A file's text at a revision, or undefined if it does not exist there. */
function fileAt(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

/** `git diff --name-status` between the merge base and head, renames as their new path. */
function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-status', '--no-renames', `${base}...${head}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status[0], path };
    });
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const base = argValue(args, '--base') ?? 'origin/main';
  const head = argValue(args, '--head') ?? 'HEAD';
  const bodyFile = argValue(args, '--body-file');
  const body = bodyFile ? readFileSync(bodyFile, 'utf8') : process.env.PR_BODY;

  if (body === undefined) {
    console.error('usage: node scripts/check-pr.mjs [--base <rev>] [--head <rev>] (--body-file <file> | PR_BODY=…)');
    process.exit(2);
  }

  const files = changedFiles(base, head);
  const mergeBase = execFileSync('git', ['merge-base', base, head], { encoding: 'utf8' }).trim();
  const contents = {};
  for (const { path } of files) {
    if (path.endsWith('package-lock.json') || path === BUDGET_FILE) {
      contents[path] = { before: fileAt(mergeBase, path), after: fileAt(head, path) };
    }
  }
  const problems = auditPullRequest({ body, files, contents });

  if (problems.length === 0) {
    console.log(`Pull request ready for audit: ${files.length} file(s) checked, description complete.`);
    return;
  }

  console.error(`This pull request is not ready for audit — ${problems.length} problem(s):\n`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error::${problem}`);
  }
  console.error('\nWhat each part is for: docs/guides/open-a-pull-request.md');

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = ['### Not ready for audit', '', ...problems.map((problem) => `- ${problem}`), ''].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }

  process.exit(1);
}

/** Run as a script, not when imported by the tests. Windows varies the drive letter's case. */
const self = (path) => resolve(path).toLowerCase();
if (process.argv[1] && self(fileURLToPath(import.meta.url)) === self(process.argv[1])) {
  main();
}
