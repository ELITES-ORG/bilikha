/**
 * Drive headless Chrome over CDP to look at the real app.
 *
 * There is no Playwright here on purpose (ADR 0031), but plenty of checks are
 * "does this render correctly" rather than "does this function return X" —
 * fifteen screens in dark mode, a control that only appears when signed in, a
 * theme choice that disagrees with the OS. Node 24 ships a WebSocket client and
 * the machine has Chrome, so this needs no dependency at all.
 *
 * It does NOT replace looking at a real phone: this is desktop Chrome emulating
 * a viewport, so font rendering, the actual address bar and safe-area insets
 * are not the real thing.
 *
 *   node scripts/screenshot.mjs '{"url":"...","out":"shot.png","scheme":"dark",
 *                                 "w":375,"h":812,
 *                                 "seed":{"key":"bilikha-theme","value":"light"},
 *                                 "evaluate":"document.title"}'
 *
 * `seed` writes localStorage on the origin and reloads, so anything read before
 * first paint sees it. `evaluate` runs after settle and prints the result.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const spec = JSON.parse(process.argv[2]);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TEMP + '/claude/shot/p2', 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(250);
  }
  throw new Error('no debugging target');
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m.result);
};
const send = (method, params = {}) =>
  new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: spec.w ?? 375, height: spec.h ?? 812, deviceScaleFactor: 2, mobile: (spec.w ?? 375) < 700,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: spec.scheme ?? 'light' }],
});

// Seed storage on the real origin, then reload so the pre-paint script sees it.
if (spec.seed) {
  await send('Page.navigate', { url: spec.url });
  await wait(2000);
  await send('Runtime.evaluate', { expression: `try{localStorage.setItem(${JSON.stringify(spec.seed.key)},${JSON.stringify(spec.seed.value)})}catch(e){}` });
}

await send('Page.navigate', { url: spec.url });
await wait(spec.settle ?? 3500);

if (spec.evaluate) {
  const r = await send('Runtime.evaluate', { expression: spec.evaluate, returnByValue: true });
  console.log('eval:', JSON.stringify(r?.result?.value));
}

const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(spec.out, Buffer.from(data, 'base64'));
console.log(`${spec.out}  ${spec.w ?? 375}x${spec.h ?? 812}  os:${spec.scheme ?? 'light'}${spec.seed ? `  stored:${spec.seed.value}` : ''}`);
ws.close(); chrome.kill(); process.exit(0);
