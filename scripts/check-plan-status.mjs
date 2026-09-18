/**
 * A plan's Status line must not claim more than its own Progress table.
 *
 * This has drifted five times: a plan reads "Complete" at the top while its
 * table still records a phase as partial, usually because the interactive
 * verification could not be run. The table is the honest half and the status
 * line is what anyone reads first, so the status line is the one that has to
 * be right.
 *
 * The check is deliberately narrow. It compares the two summaries and nothing
 * else — it does not count unticked boxes, because a superseded phase (plan
 * 0009's portfolio work, retired by plan 0010) legitimately leaves a run of
 * them behind while the plan really is finished.
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

/** `| 3. Verification | 2 / 4 | Partial — ... |` → captures the third column. */
const PHASE_ROW = /^\|\s*\d+\.[^|]*\|[^|]*\|\s*([^|]*?)\s*\|/;

const failures = [];
let checked = 0;

const names = (await readdir(PLANS)).filter((file) => /^\d{4}-.*\.md$/.test(file));

for (const name of names) {
  const file = path.join(PLANS, name);
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);

  const statusLine = lines.find((line) => line.startsWith('- **Status:**'));
  if (!statusLine) continue;

  const status = statusLine.replace('- **Status:**', '').trim();
  if (!CLAIMS_FINISHED(status)) continue;

  checked += 1;

  for (const [index, line] of lines.entries()) {
    const match = PHASE_ROW.exec(line);
    if (!match) continue;

    const phaseStatus = match[1];
    if (phaseStatus && !PHASE_FINISHED(phaseStatus)) {
      failures.push({
        file: path.relative(process.cwd(), file),
        line: index + 1,
        status,
        phaseStatus,
      });
    }
  }
}

console.log(`Checked ${checked} plan(s) claiming to be finished.`);

if (failures.length > 0) {
  console.error(`\n${failures.length} plan phase(s) disagree with their status line:\n`);
  for (const { file, line, status, phaseStatus } of failures) {
    console.error(`  ${file}:${line}  status "${status}" but phase reads "${phaseStatus}"`);
  }
  console.error('\nEither finish the phase or qualify the status line.');
  process.exit(1);
}

console.log('Every finished plan agrees with its own progress table.');
