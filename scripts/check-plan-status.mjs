/**
 * A plan must not claim more than it has done, in either of the two places it
 * summarises itself.
 *
 * Two checks, because the drift happens twice over:
 *
 * 1. The Status line must not outrun the Progress table. This drifted five
 *    times: a plan reads "Complete" at the top while its table still records a
 *    phase as partial, usually because an interactive check could not be run.
 *
 * 2. A phase row claiming Done must have no unticked boxes in its own section.
 *    This one was found on 2026-09-19: plan 0009's table read all-Done while 44
 *    boxes sat unticked, 18 of them in a phase that was never built at all —
 *    the portfolio work retired by plan 0010. The earlier version of this script
 *    deliberately skipped box counting, naming that very plan as the reason a
 *    finished plan may legitimately leave boxes behind. That reasoning was
 *    backwards: the boxes were the evidence, and exempting them hid it.
 *
 * A superseded, deferred or partial phase says so in its status cell and is
 * exempt. That is the honest way to leave boxes unticked — say why in the
 * table, where the next person reads it, rather than leave the count to be
 * discovered.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PLANS = path.join(process.cwd(), 'docs', 'plans');

/**
 * Only an *unqualified* "Complete" or "Done" claims everything is finished.
 * "Complete, except the browser smoke test" is already an honest status, and a
 * script cannot judge whether the qualification is accurate — the author is on
 * the hook for that. So this reads the bare word and nothing else.
 */
const CLAIMS_FINISHED = (value) => /^(complete|done)\.?$/i.test(value.trim());

/** Phase cells are looser: "Complete", "Done" and "Complete locally" all count. */
const PHASE_FINISHED = (value) => /^(complete|done)/i.test(value.trim());

/** `| 3. Verification | 2 / 4 | Partial — ... |` → phase number, steps cell, status cell. */
const PHASE_ROW = /^\|\s*(\d+)\.[^|]*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/;

/**
 * `11 / 11` is a claim of completeness the prose cannot wriggle out of, and it
 * is the honest signal: a status cell like "7.8 and 7.9 done in a browser" does
 * not start with "Done", so reading the prose alone exempted whole phases
 * silently. Found by unticking a box and watching the check pass.
 */
const STEPS_ALL_DONE = (value) => {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
  return Boolean(m) && m[1] === m[2] && m[1] !== '0';
};

/** A phase that says why it stays open is exempt — that is the honest escape. */
const EXEMPT = (value) =>
  /supersed|revert|defer|partly|partial|unticked|not started|outstanding|remains/i.test(value);

/** `# Phase 6 — Portfolio` */
const PHASE_HEADING = /^#\s*Phase\s+(\d+)\b/;

const statusFailures = [];
const boxFailures = [];
let checked = 0;
let phasesChecked = 0;

const names = (await readdir(PLANS)).filter((file) => /^\d{4}-.*\.md$/.test(file));

for (const name of names) {
  const file = path.join(PLANS, name);
  const relative = path.relative(process.cwd(), file);
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);

  // --- what each phase row claims, and where it sits ---
  const claims = new Map();
  for (const [index, line] of lines.entries()) {
    const match = PHASE_ROW.exec(line);
    if (match) claims.set(match[1], { steps: match[2], status: match[3], line: index + 1 });
  }

  // --- unticked boxes, attributed to the phase heading above them ---
  const open = new Map();
  let current = null;
  for (const line of lines) {
    const heading = PHASE_HEADING.exec(line);
    if (heading) current = heading[1];
    // Any other top-level heading ends the phase. Without this the trailing
    // `## Acceptance` checklist is attributed to whichever phase came last —
    // plan 0002's phase 7 reported 15 open boxes when it has 6, the other 9
    // being the plan's own acceptance list.
    else if (/^#{1,2}\s/.test(line)) current = null;
    if (current && /^\s*-\s*\[ \]/.test(line)) {
      open.set(current, (open.get(current) ?? 0) + 1);
    }
  }

  // Check 2 runs on every plan: a phase claiming Done should have no open
  // boxes whatever the plan's overall status says.
  for (const [phase, { steps, status, line }] of claims) {
    if (EXEMPT(status)) continue;
    if (!PHASE_FINISHED(status) && !STEPS_ALL_DONE(steps)) continue;
    phasesChecked += 1;
    const count = open.get(phase) ?? 0;
    if (count > 0) {
      boxFailures.push({ file: relative, line, phase, status, count });
    }
  }

  // --- check 1: the status line against the table ---
  const statusLine = lines.find((line) => line.startsWith('- **Status:**'));
  if (!statusLine) continue;
  const status = statusLine.replace('- **Status:**', '').trim();
  if (!CLAIMS_FINISHED(status)) continue;

  checked += 1;
  for (const [, { steps, status: phaseStatus, line }] of claims) {
    if (phaseStatus && !PHASE_FINISHED(phaseStatus) && !STEPS_ALL_DONE(steps)) {
      statusFailures.push({ file: relative, line, status, phaseStatus });
    }
  }
}

// --- check 3: the index must not contradict the plans ---
//
// Found on 2026-09-22: the plans README listed six finished plans as "Ready" or
// "Built", including four this session had completed and recorded. The index is
// what anyone scans first, so a stale row there is the same lie as a stale
// status line — and nothing was checking it.
const indexFailures = [];
const indexPath = path.join(PLANS, 'README.md');
const indexText = await readFile(indexPath, 'utf8');
const ROW = /\|\s*\[(\d{4})\]\(\.\/([^)]+)\)\s*\|[^|]*\|\s*([^|]+?)\s*\|/g;

/** The index carries the status up to its first clause break, not the essay. */
const shortForm = (value) => value.split(';')[0].split(',')[0].split(' —')[0].trim();

for (const match of indexText.matchAll(ROW)) {
  const [, number, file, indexStatus] = match;
  let planText;
  try {
    planText = await readFile(path.join(PLANS, file), 'utf8');
  } catch {
    indexFailures.push({ number, indexStatus, planStatus: '(file missing)' });
    continue;
  }
  const statusLine = planText.split(/\r?\n/).find((line) => line.startsWith('- **Status:**'));
  if (!statusLine) continue;
  const planStatus = shortForm(statusLine.replace('- **Status:**', '').trim());
  if (planStatus.toLowerCase() !== indexStatus.trim().toLowerCase()) {
    indexFailures.push({ number, indexStatus: indexStatus.trim(), planStatus });
  }
}

console.log(`Checked ${checked} plan(s) claiming to be finished.`);
console.log(`Checked ${phasesChecked} phase(s) claiming to be finished.`);

if (statusFailures.length > 0) {
  console.error(`\n${statusFailures.length} plan phase(s) disagree with their status line:\n`);
  for (const { file, line, status, phaseStatus } of statusFailures) {
    console.error(`  ${file}:${line}  status "${status}" but phase reads "${phaseStatus}"`);
  }
  console.error('\nEither finish the phase or qualify the status line.');
}

if (boxFailures.length > 0) {
  console.error(`\n${boxFailures.length} phase(s) claim to be finished with boxes still open:\n`);
  for (const { file, line, phase, status, count } of boxFailures) {
    console.error(`  ${file}:${line}  phase ${phase} reads "${status}" but has ${count} unticked box(es)`);
  }
  console.error('\nTick them, or say in the table why they stay open (superseded, deferred, partly).');
}

if (indexFailures.length > 0) {
  console.error(`\n${indexFailures.length} plan(s) disagree with the README index:\n`);
  for (const { number, indexStatus, planStatus } of indexFailures) {
    console.error(`  plan ${number}  index says "${indexStatus}" but the plan says "${planStatus}"`);
  }
  console.error('\nUpdate docs/plans/README.md — it is what people read first.');
}

if (statusFailures.length > 0 || boxFailures.length > 0 || indexFailures.length > 0) {
  process.exit(1);
}

console.log('Every finished plan agrees with its own progress table.');
console.log('Every finished phase has its boxes ticked.');
console.log('The README index agrees with every plan.');
