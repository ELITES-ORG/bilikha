# Check a screen in a browser

Plenty of checks are "does this render correctly" rather than "does this
function return X": a screen in dark mode, a control that only appears when
signed in, a guard that must not flash its interface before redirecting. There
is no Playwright here on purpose ([ADR 0031](../decisions/0031-testing-strategy.md)),
but Node ships a WebSocket client and the machine has Chrome, so
`scripts/screenshot.mjs` drives it over CDP with no dependency at all.

```bash
node scripts/screenshot.mjs '{"url":"http://localhost:5173/directory","out":"shot.png"}'
```

## What the spec takes

| Key | What it does |
|---|---|
| `url`, `out` | The page, and where the PNG lands. |
| `w`, `h` | Viewport. Under 700 emulates a mobile device. |
| `scheme` | The OS `prefers-color-scheme`, `light` or `dark`. |
| `seed` | Writes `localStorage` on the origin, then reloads — so a pre-paint script sees it. |
| `cookies` | Session cookies, set before the first navigation. This is what makes a signed-in screen reachable. |
| `click` | A selector, or `text=Label`. An array runs in order, which is how a two-tap path gets checked. |
| `evaluate` | Runs after settle and prints the result. |
| `record` | Samples every animation frame from first paint. |
| `throttle` | `{latency, down, up}`. |
| `settle` | Milliseconds to wait before shooting. Default 3500. |

## Signing in

Point it at a **local** server and a **local** account. A session cookie is a
credential, and this writes it to a scratch profile on disk — never do this with
a production session. Create accounts through the API rather than by inserting
rows, so they go through the same validation a real registration does.

```bash
curl -s localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"...","password":"..."}' -D- -o/dev/null | grep -i set-cookie
```

Then pass the `bilikha.sid` value as `cookies: [{name, value}]`.

## Checking what a screenshot cannot show

A settled screenshot cannot answer "did it flash the wrong thing first". `record`
samples `data-theme`, the computed background, the path and the visible text on
every frame from first paint, and writes them beside the PNG as
`<out>.frames.json`. Two questions it has already answered:

- **The admin guard.** A non-admin opening `/admin/media` redirects — but does it
  render the admin screen on the way? 202 frames, `/admin/media` → `/` →
  `/directory`, none containing admin text.
- **The theme flash.** Light chosen with the OS in dark: one background value
  across every painted frame, and `data-theme` already `light` on the first.

Run the inverse of whatever you are checking. "No dark frame" means nothing
until you have shown the same recorder reports dark frames when the theme *is*
dark — otherwise you have tested your parser, not the app.

## Throttle against the built app, not the dev server

`npm run build && npx vite preview --port 4173`. Vite's dev server loads hundreds
of separate modules and pays the latency on each, so under throttling nothing
paints inside any reasonable window — you get a recording of a blank page and a
tick that means nothing. The built app is one stylesheet and one bundle, which
is also what a user gets.

## What this still is not

Desktop Chrome emulating a viewport. Font rendering, the real address bar and
safe-area insets are not the real thing, so anything about how a **phone**
behaves still needs a phone.
