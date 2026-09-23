#!/usr/bin/env node
/**
 * Rejects AI attribution in commit messages.
 *
 * CLAUDE.md has forbidden `Co-authored-by` trailers naming an AI tool for as
 * long as the contributor rules have existed, and the agents that read the file
 * obeyed it. The trailers arrived anyway: 37 commit objects in this repository
 * carry `Co-authored-by: Cursor <cursoragent@cursor.com>`, 10 of them reached
 * GitHub before being amended away, and that was enough to attach a bot account
 * to the repository's contributor list — permanently, because GitHub does not
 * retract a contribution when the commit is force-pushed out of history.
 *
 * A rule in a markdown file only binds the tools that read it. This binds the
 * ones that do not. See ADR 0041.
 *
 * Two modes:
 *
 *   node scripts/check-commit-msg.mjs .git/COMMIT_EDITMSG    # one message file
 *   node scripts/check-commit-msg.mjs --range main..HEAD     # every commit in a range
 *
 * Exits 1 if any message carries attribution.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Matched against the display name of a `Co-authored-by` trailer. Deliberately
 * a list of product names rather than anything clever: a human contributor is
 * not called Copilot, and a check that tries to infer "is this an AI" from
 * shape rather than from a name would reject real people.
 */
const AI_NAME = /\b(cursor|claude|anthropic|copilot|codex|chatgpt|openai|gemini|devin|aider|windsurf|cody|tabnine)\b/i;

/**
 * Matched against the email. `[bot]` and a bare `bot@` cover the accounts
 * GitHub itself marks as bots. `users.noreply.github.com` is NOT listed — that
 * is the address real contributors use when they hide their email.
 */
const AI_EMAIL = /(cursoragent|@cursor\.com|@anthropic\.com|@openai\.com|\[bot\]|\bbot@|@[\w.-]+\.ai\b)/i;

/** Footers that claim AI authorship without using a trailer. */
const AI_FOOTERS = [
  { pattern: /🤖/u, why: 'robot-emoji generation footer' },
  {
    pattern: /\bgenerated (with|by)\b[^\n]*\b(claude|cursor|copilot|chatgpt|codex|gemini|ai)\b/i,
    why: '"Generated with <AI tool>" footer',
  },
  {
    pattern: /\b(assisted|written|authored) by\b[^\n]*\b(claude|cursor|copilot|chatgpt|codex|gemini|an? ai)\b/i,
    why: '"Assisted by <AI tool>" line',
  },
];

const TRAILER = /^\s*co-authored-by:\s*(.+?)\s*$/i;

/**
 * Git strips comment lines itself, but only after this hook has run, so the
 * message still contains the whole commit template at the point we see it.
 * Everything below the scissors line is diff, not message.
 */
function stripComments(message) {
  const scissors = message.indexOf('\n# ------------------------ >8');
  const body = scissors === -1 ? message : message.slice(0, scissors);
  return body
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
}

/** Returns a list of `{ line, text, why }` for everything wrong with a message. */
function inspect(message) {
  const problems = [];
  const lines = stripComments(message).split('\n');

  lines.forEach((text, index) => {
    const trailer = text.match(TRAILER);

    if (trailer) {
      const identity = trailer[1];
      if (AI_NAME.test(identity) || AI_EMAIL.test(identity)) {
        problems.push({ line: index + 1, text: text.trim(), why: 'Co-authored-by naming an AI tool' });
      }
      return;
    }

    for (const { pattern, why } of AI_FOOTERS) {
      if (pattern.test(text)) {
        problems.push({ line: index + 1, text: text.trim(), why });
        return;
      }
    }
  });

  return problems;
}

/** Reads `git log` for a range into `{ sha, subject, message }` records. */
function commitsInRange(range) {
  const out = execFileSync('git', ['log', '--format=%H%x1f%B%x1e', ...range.split(/\s+/).filter(Boolean)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  return out
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [sha, message] = record.split('\x1f');
      return { sha, message, subject: message.split('\n')[0] };
    });
}

function report(label, problems) {
  console.error(`\n  ${label}`);
  for (const { line, text, why } of problems) {
    console.error(`    line ${line}: ${text}`);
    console.error(`             ^ ${why}`);
  }
}

const args = process.argv.slice(2);
let failed = 0;
let checked = 0;

if (args[0] === '--range') {
  const range = args[1];

  if (!range) {
    console.error('usage: node scripts/check-commit-msg.mjs --range <rev-range>');
    process.exit(2);
  }

  for (const { sha, subject, message } of commitsInRange(range)) {
    checked += 1;
    const problems = inspect(message);
    if (problems.length > 0) {
      if (failed === 0) console.error('AI attribution found in commit messages:');
      report(`${sha.slice(0, 7)}  ${subject}`, problems);
      failed += 1;
    }
  }
} else {
  const file = args[0];

  if (!file) {
    console.error('usage: node scripts/check-commit-msg.mjs <message-file> | --range <rev-range>');
    process.exit(2);
  }

  checked = 1;
  const problems = inspect(readFileSync(file, 'utf8'));

  if (problems.length > 0) {
    console.error('AI attribution found in the commit message:');
    report('the message you just wrote', problems);
    failed = 1;
  }
}

if (failed > 0) {
  console.error(`
Commits in this repository are authored by the human contributor alone. The
commit history is a professional record of the organisation's work, and the
tooling used to produce it does not belong in authorship metadata — CLAUDE.md,
"Commit and pull request attribution", and ADR 0041.

Remove the line(s) above and commit again:

    git commit --amend            # the commit you just made
    git rebase -i <base>          # anything older

Do not reach for --no-verify. CI runs this same check on every push, and a
trailer that reaches GitHub even once attaches that account to the contributor
list for good.
`);
  process.exit(1);
}

console.log(`Checked ${checked} commit message(s). No AI attribution.`);
