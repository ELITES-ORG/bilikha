import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialAssets, overBudget } from './check-bundle-size.mjs';

const HTML = `<!doctype html><html><head>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <script>var inline = true;</script>
  <script type="module" crossorigin src="/assets/index-AAA.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/ui-BBB.js">
  <link rel="modulepreload" crossorigin href="/assets/api-client-CCC.js">
  <link rel="stylesheet" crossorigin href="/assets/index-DDD.css">
</head><body></body></html>`;

test('counts the entry script, modulepreloaded chunks and the stylesheet', () => {
  assert.deepEqual(initialAssets(HTML), {
    js: ['/assets/index-AAA.js', '/assets/ui-BBB.js', '/assets/api-client-CCC.js'],
    css: ['/assets/index-DDD.css'],
  });
});

test('ignores inline scripts, icons and the manifest', () => {
  const { js, css } = initialAssets(HTML);
  assert.ok(![...js, ...css].some((path) => /favicon|manifest/.test(path)));
});

const BUDGET = { initialJsGzipBytes: 1000, initialCssGzipBytes: 500 };

test('within budget, including exactly at it, passes', () => {
  assert.deepEqual(overBudget({ initialJsGzipBytes: 1000, initialCssGzipBytes: 499 }, BUDGET), []);
});

test('over budget names what grew and by how much', () => {
  const problems = overBudget({ initialJsGzipBytes: 1250, initialCssGzipBytes: 900 }, BUDGET);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Initial JS is 1\.25 kB gzip, over its 1\.00 kB budget by 0\.25 kB/);
  assert.match(problems[1], /Initial CSS/);
});

test('a missing budget fails rather than passing silently', () => {
  assert.match(overBudget({ initialJsGzipBytes: 1, initialCssGzipBytes: 1 }, {})[0], /no budget set/);
});
