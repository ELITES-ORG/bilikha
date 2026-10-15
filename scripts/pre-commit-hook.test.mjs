import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', '.githooks');

/**
 * A scratch repository wired to this repository's hooks, so each case is a real
 * `git commit` — git runs the hook exactly as it would for a contributor.
 */
const repo = mkdtempSync(join(tmpdir(), 'bilikha-pre-commit-'));
const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

git('init', '-q');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'test');
git('config', 'core.hooksPath', HOOKS);

after(() => rmSync(repo, { recursive: true, force: true }));

/** Stages one file, even an ignored one, and reports whether the commit went through. */
function commit(path) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), `${path} ${Math.random()}\n`);
  git('add', '-f', path);
  const result = git('commit', '-q', '-m', `Add ${path}`);
  git('reset', '-q');
  return result;
}

for (const path of ['.env', 'backend/.env.local', 'frontend/.env.production', '.env.local.example']) {
  test(`rejects ${path}`, () => {
    const result = commit(path);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not be committed/);
  });
}

for (const path of ['.env.example', 'backend/.env.example', 'src/environment.ts']) {
  test(`allows ${path}`, () => {
    assert.equal(commit(path).status, 0);
  });
}
