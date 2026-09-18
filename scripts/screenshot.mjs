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
 *                                 "cookies":[{"name":"bilikha.sid","value":"..."}],
 *                                 "click":"a[href='/admin/media']",
 *                                 "evaluate":"document.title"}'
 *
 * `seed` writes localStorage on the origin and reloads, so anything read before
 * first paint sees it. `evaluate` runs after settle and prints the result.
 *
 * `cookies` sets session cookies before the first navigation, which is what
 * makes a signed-in screen reachable at all. Point it at a LOCAL server and a
 * local account — a session cookie is a credential, and this writes it to a
 * scratch profile on disk.
 *
 * `click` dispatches a real click on a selector after settle, waits, and shoots
 * the result. That is the difference between "the link is marked active" and
 * "the link actually goes there", which a unit test cannot tell you.
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
await send('Network.enable');

if (spec.cookies) {
  const { host, protocol } = new URL(spec.url);
  for (const c of spec.cookies) {
    await send('Network.setCookie', {
      name: c.name,
      value: c.value,
      domain: c.domain ?? host.split(':')[0],
      path: c.path ?? '/',
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? protocol === 'https:',
    });
  }
}
await send('Emulation.setDeviceMetricsOverride', {
  width: spec.w ?? 375, height: spec.h ?? 812, deviceScaleFactor: 2, mobile: (spec.w ?? 375) < 700,
});
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: spec.scheme ?? 'light' }],
});

// A slow link widens the gap between markup arriving and the stylesheet
// applying, which is exactly where a theme flash hides.
if (spec.throttle) {
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: spec.throttle.latency ?? 400,
    downloadThroughput: spec.throttle.down ?? (400 * 1024) / 8,
    uploadThroughput: spec.throttle.up ?? (400 * 1024) / 8,
  });
}

// Record what the page looked like on every frame from the very first one.
// "Does it flash the wrong thing before settling" cannot be answered by looking
// at the settled page, which is the only thing a screenshot shows.
if (spec.record) {
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__frames = [];
      (function sample() {
        try {
          const el = document.documentElement;
          window.__frames.push({
            t: Math.round(performance.now()),
            bg: getComputedStyle(document.body || el).backgroundColor,
            scheme: getComputedStyle(el).colorScheme,
            theme: el.getAttribute('data-theme'),
            path: location.pathname,
            text: (document.body ? document.body.innerText : '').slice(0, 160),
          });
        } catch (e) {}
        if (window.__frames.length < 3000) requestAnimationFrame(sample);
      })();`,
  });
}

// Seed storage on the real origin, then reload so the pre-paint script sees it.
if (spec.seed) {
  await send('Page.navigate', { url: spec.url });
  await wait(2000);
  await send('Runtime.evaluate', { expression: `try{localStorage.setItem(${JSON.stringify(spec.seed.key)},${JSON.stringify(spec.seed.value)})}catch(e){}` });
}

await send('Page.navigate', { url: spec.url });
await wait(spec.settle ?? 3500);

// A selector, or `text=Label` to match a control by its visible text. An array
// runs them in order, which is how a two-tap path gets checked.
for (const target of [].concat(spec.click ?? [])) {
  const expr = target.startsWith('text=')
    ? `(() => { const t = ${JSON.stringify(target.slice(5))};
        const el = Array.from(document.querySelectorAll('button,a,[role=tab]'))
          .find((e) => e.textContent.trim() === t);
        if (!el) return 'NOT FOUND: ' + t; el.click(); return 'clicked: ' + t; })()`
    : `(() => { const el = document.querySelector(${JSON.stringify(target)});
        if (!el) return 'NOT FOUND: ' + ${JSON.stringify(target)};
        el.click(); return el.getAttribute('href') ?? el.textContent.trim().slice(0, 40); })()`;
  const clicked = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('click:', JSON.stringify(clicked?.result?.value));
  await wait(spec.afterClick ?? 1500);
}

if (spec.evaluate) {
  const r = await send('Runtime.evaluate', { expression: spec.evaluate, returnByValue: true });
  console.log('eval:', JSON.stringify(r?.result?.value));
}

if (spec.record) {
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__frames || [])`,
    returnByValue: true,
  });
  fs.writeFileSync(spec.out.replace(/\.png$/, '.frames.json'), r?.result?.value ?? '[]');
  const frames = JSON.parse(r?.result?.value ?? '[]');
  console.log('frames:', frames.length, 'first:', JSON.stringify(frames[0] ?? null));
}

const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(spec.out, Buffer.from(data, 'base64'));
console.log(`${spec.out}  ${spec.w ?? 375}x${spec.h ?? 812}  os:${spec.scheme ?? 'light'}${spec.seed ? `  stored:${spec.seed.value}` : ''}`);
ws.close(); chrome.kill(); process.exit(0);
