#!/usr/bin/env node
/**
 * Points this clone's hooks at .githooks/, which is version-controlled.
 *
 * Git will not share hooks on its own: .git/hooks is per-clone and never
 * travels with a checkout. core.hooksPath is the one setting that redirects it,
 * and it has to be set once per clone — so `npm run setup` sets it.
 *
 * Idempotent, and never clobbers a hooks path someone else configured.
 */
import { chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_PATH = '.githooks';

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe', ...options }).trim();
}

try {
  git(['rev-parse', '--git-dir']);
} catch {
  // A tarball or a vendored copy is not a mistake — it just has no hooks.
  console.log('  skip    not a git repository, no hooks to install');
  process.exit(0);
}

let current = '';
try {
  current = git(['config', '--get', 'core.hooksPath']);
} catch {
  // Unset. git exits 1 for a missing key, which is not an error here.
}

if (current && current !== HOOKS_PATH) {
  console.warn(`  warn    core.hooksPath is already ${current}, leaving it alone`);
  console.warn(`          Bilikha's hooks live in ${HOOKS_PATH}/ — wire them in by hand if you want them`);
  process.exit(0);
}

if (current === HOOKS_PATH) {
  console.log(`  keep    core.hooksPath already ${HOOKS_PATH}`);
} else {
  git(['config', 'core.hooksPath', HOOKS_PATH]);
  console.log(`  set     core.hooksPath -> ${HOOKS_PATH}`);
}

// Checkouts on filesystems that drop the executable bit leave a hook git will
// silently refuse to run. Cheap to reassert.
const hook = join(root, HOOKS_PATH, 'commit-msg');
if (existsSync(hook)) {
  chmodSync(hook, 0o755);
}
