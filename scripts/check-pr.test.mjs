import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { auditPullRequest } from './check-pr.mjs';

const TEMPLATE = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');

/** A description that fills in every required section. */
const COMPLETE = `
## What and why

Lets a creative pin one offer to the top of their profile.

Plan / issue: docs/plans/0040-pinned-offers.md

## Acceptance criteria

- [x] A creative can pin one offer

## What changed

- **Database:** none
- **API:** none
- **UI:** none
- **Config:** none

## How to verify

1. Sign in as a creative and pin an offer.

## Rollout

- [x] No migration
- [x] No new environment variable
- [x] No one-off script

## Known gaps and risks

None.

## Checklist

- [x] One feature
- [x] Checks pass locally
`;

const STATES_DONE = `
## States checked

- [x] Empty, loading and error states
- [ ] Admin, where it applies — n/a, no admin surface

## Screenshots

![offer card, dark](https://example.com/shot.png)
`;

const files = (...paths) => paths.map((path) => ({ status: 'M', path }));
const has = (problems, fragment) => problems.some((problem) => problem.includes(fragment));

test('a complete description with a docs-only diff passes', () => {
  assert.deepEqual(auditPullRequest({ body: COMPLETE, files: files('docs/guides/x.md') }), []);
});

test('the untouched template fails on every required section', () => {
  const problems = auditPullRequest({ body: TEMPLATE, files: files('docs/guides/x.md') });
  for (const title of ['What and why', 'Acceptance criteria', 'How to verify', 'Known gaps and risks']) {
    assert.ok(has(problems, `"${title}" section is empty`), title);
  }
  assert.ok(has(problems, '"Plan / issue:" is blank'));
  assert.ok(has(problems, '"Rollout" has unticked boxes'));
  assert.ok(has(problems, '"Checklist" has unticked boxes'));
  assert.ok(has(problems, 'leaves **Database** blank'));
});

test('a deleted section is reported as missing', () => {
  const body = COMPLETE.replace(/## Known gaps and risks\n\nNone\.\n/, '');
  assert.ok(has(auditPullRequest({ body, files: [] }), '"Known gaps and risks" section is missing'));
});

test('acceptance criteria must be a checkable list', () => {
  const body = COMPLETE.replace('- [x] A creative can pin one offer', 'It works.');
  assert.ok(has(auditPullRequest({ body, files: [] }), 'no checkable item'));
});

test('a UI change needs states and a screenshot', () => {
  const problems = auditPullRequest({ body: COMPLETE, files: files('frontend/src/pages/Offer.tsx', 'frontend/src/pages/Offer.test.tsx') });
  assert.ok(has(problems, '"States checked" is required'));
  assert.ok(has(problems, '"Screenshots" needs at least one image'));
});

test('a UI change with states and a screenshot passes, n/a lines allowed', () => {
  const problems = auditPullRequest({
    body: COMPLETE + STATES_DONE,
    files: files('frontend/src/pages/Offer.tsx', 'frontend/src/pages/Offer.test.tsx'),
  });
  assert.deepEqual(problems, []);
});

test('an unchecked state without n/a fails', () => {
  const body = COMPLETE + STATES_DONE.replace('- [x] Empty', '- [ ] Empty');
  const problems = auditPullRequest({ body, files: files('frontend/src/pages/Offer.tsx', 'frontend/src/pages/Offer.test.tsx') });
  assert.ok(has(problems, '1 unchecked state'));
});

test('code without a test fails, unless an exception gives a reason', () => {
  const code = files('backend/src/modules/offers/offers.service.ts');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: code }), 'no test did'));
  assert.ok(has(auditPullRequest({ body: `${COMPLETE}\nNo tests: n/a\n`, files: code }), 'no test did'), 'too short');
  assert.deepEqual(
    auditPullRequest({ body: `${COMPLETE}\nNo tests: a rename with no behaviour change\n`, files: code }),
    [],
  );
});

test('a schema change needs a migration', () => {
  const schema = files('backend/src/db/schema/offers.ts', 'backend/src/db/schema/offers.test.ts');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: schema }), 'no migration'));
  assert.deepEqual(
    auditPullRequest({ body: COMPLETE, files: [...schema, { status: 'A', path: 'backend/drizzle/0031_pins.sql' }] }),
    [],
  );
});

test('a route change needs the API reference', () => {
  const routes = files('backend/src/modules/offers/offers.routes.ts', 'backend/src/modules/offers/offers.test.ts');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: routes }), 'api.md did not'));
  assert.deepEqual(auditPullRequest({ body: COMPLETE, files: [...routes, ...files('docs/reference/api.md')] }), []);
});

test('an env schema change needs .env.example and the environment reference', () => {
  const env = files('backend/src/config/env.ts', 'backend/src/config/env.test.ts', 'backend/.env.example');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: env }), 'env.ts changed'));
  assert.deepEqual(
    auditPullRequest({ body: COMPLETE, files: [...env, ...files('docs/reference/environment.md')] }),
    [],
  );
});

test('a lockfile that changed alone fails, unless it is declared', () => {
  const lock = files('backend/package-lock.json');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: lock }), 'package.json did not'));
  assert.deepEqual(auditPullRequest({ body: COMPLETE, files: [...lock, ...files('backend/package.json')] }), []);
  assert.deepEqual(
    auditPullRequest({ body: `${COMPLETE}\nLockfile only: npm audit fix for a patched esbuild\n`, files: lock }),
    [],
  );
});

test('environment files, scratch output and cookie jars are refused', () => {
  const problems = auditPullRequest({
    body: COMPLETE,
    files: files('backend/.env', 'frontend/.env.local', 'tmp/run.json', 'tmp-login.json', 'session.cookies'),
  });
  assert.equal(problems.filter((problem) => problem.includes('must not be committed')).length, 5);
});

test('.env.example is allowed, and deleting a forbidden file is fine', () => {
  assert.deepEqual(auditPullRequest({ body: COMPLETE, files: files('backend/.env.example') }), []);
  assert.deepEqual(auditPullRequest({ body: COMPLETE, files: [{ status: 'D', path: 'tmp/old.json' }] }), []);
});

test('template comments do not count as content', () => {
  const body = COMPLETE.replace('None.', '<!-- nothing to say -->');
  assert.ok(has(auditPullRequest({ body, files: [] }), '"Known gaps and risks" section is empty'));
});

// --- rules added after the audit of #11 -------------------------------------

test('tooling changed alongside the product fails, unless an exception gives a reason', () => {
  const mixed = files('.claude/settings.json', '.mcp.json', 'backend/src/modules/offers/offers.service.ts', 'backend/src/modules/offers/offers.test.ts');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: mixed }), "the repository's own tooling"));
  assert.deepEqual(
    auditPullRequest({ body: `${COMPLETE}\nTooling change: the hook must ship with the API it guards\n`, files: mixed }),
    [],
  );
});

test('a tooling-only pull request passes', () => {
  assert.deepEqual(
    auditPullRequest({ body: COMPLETE, files: files('.github/workflows/ci.yml', 'scripts/check-pr.mjs', 'scripts/check-pr.test.mjs') }),
    [],
  );
});

test('CLAUDE.md and the git hooks count as tooling', () => {
  for (const path of ['CLAUDE.md', '.githooks/pre-commit', 'package.json']) {
    const problems = auditPullRequest({ body: COMPLETE, files: files(path, 'backend/src/x.ts', 'backend/src/x.test.ts') });
    assert.ok(has(problems, "the repository's own tooling"), path);
  }
});

test('a ticked box whose note says it was not done fails', () => {
  for (const note of ['signed in not yet checked in a browser', 'admin pages not opened in a browser', 'still needs a pass', 'TODO']) {
    const body = COMPLETE.replace('- [x] Checks pass locally', `- [x] Checks pass locally — ${note}`);
    assert.ok(has(auditPullRequest({ body, files: [] }), 'ticks a box its own note says was not done'), note);
  }
});

test('ordinary notes on ticked boxes pass', () => {
  for (const note of ['checked in review', 'n/a — nothing to migrate', 'nothing the running code still reads is dropped']) {
    const body = COMPLETE.replace('- [x] Checks pass locally', `- [x] Checks pass locally — ${note}`);
    assert.deepEqual(auditPullRequest({ body, files: [] }), [], note);
  }
});

const lock = (packages) => JSON.stringify({ lockfileVersion: 3, packages });
const LOCK_BEFORE = lock({
  '': { dependencies: { a: '1' } },
  'node_modules/@rollup/rollup-linux-x64-musl': { version: '4.0.0', os: ['linux'], cpu: ['x64'], libc: ['musl'] },
  'node_modules/removed-pkg': { version: '1.0.0', libc: ['glibc'] },
});

test('a lockfile that loses platform fields from installed packages fails', () => {
  const after = lock({
    '': { dependencies: { a: '1' } },
    'node_modules/@rollup/rollup-linux-x64-musl': { version: '4.0.0', os: ['linux'], cpu: ['x64'] },
  });
  const problems = auditPullRequest({
    body: COMPLETE,
    files: files('frontend/package-lock.json', 'frontend/package.json'),
    contents: { 'frontend/package-lock.json': { before: LOCK_BEFORE, after } },
  });
  assert.ok(has(problems, 'drops platform fields from 1 package(s)'));
  assert.ok(has(problems, 'rollup-linux-x64-musl (libc)'));
});

test('removing a package entirely, or keeping its fields, passes', () => {
  const after = lock({
    '': { dependencies: { a: '1' } },
    'node_modules/@rollup/rollup-linux-x64-musl': { version: '4.0.0', os: ['linux'], cpu: ['x64'], libc: ['musl'] },
  });
  assert.deepEqual(
    auditPullRequest({
      body: COMPLETE,
      files: files('frontend/package-lock.json', 'frontend/package.json'),
      contents: { 'frontend/package-lock.json': { before: LOCK_BEFORE, after } },
    }),
    [],
  );
});

const budget = (js, css) => JSON.stringify({ initialJsGzipBytes: js, initialCssGzipBytes: css });

test('raising the bundle budget needs a reason', () => {
  const contents = { 'frontend/bundle-budget.json': { before: budget(1000, 500), after: budget(1200, 500) } };
  const changed = files('frontend/bundle-budget.json');
  assert.ok(has(auditPullRequest({ body: COMPLETE, files: changed, contents }), 'raises initialJsGzipBytes'));
  assert.deepEqual(
    auditPullRequest({ body: `${COMPLETE}\nBudget raised: the map view needs its tile renderer on first load\n`, files: changed, contents }),
    [],
  );
});

test('lowering or creating the budget passes; deleting it fails', () => {
  const changed = files('frontend/bundle-budget.json');
  assert.deepEqual(
    auditPullRequest({ body: COMPLETE, files: changed, contents: { 'frontend/bundle-budget.json': { before: budget(1000, 500), after: budget(900, 450) } } }),
    [],
  );
  assert.deepEqual(
    auditPullRequest({ body: COMPLETE, files: changed, contents: { 'frontend/bundle-budget.json': { before: undefined, after: budget(1000, 500) } } }),
    [],
  );
  assert.ok(
    has(
      auditPullRequest({ body: COMPLETE, files: [{ status: 'D', path: 'frontend/bundle-budget.json' }], contents: { 'frontend/bundle-budget.json': { before: budget(1000, 500), after: undefined } } }),
      'is deleted',
    ),
  );
});
