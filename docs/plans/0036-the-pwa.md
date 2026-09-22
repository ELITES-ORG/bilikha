# 0036. The PWA

- **Status:** Phase 2 complete — a worker that caches nothing, for the install button
- **Phase 3 (offline):** Ready, and deliberately not started
- **Owner:** unassigned
- **Related:** [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)
  (the prerequisite) · [plan 0031](./0031-stop-shipping-every-page-to-every-visitor.md) ·
  [constraint 3](../explanation/constraints.md) (budget Android, metered data) ·
  [constraint 4](../explanation/constraints.md) (SSR is the launch blocker)

## Why

[Constraint 3](../explanation/constraints.md) is the whole argument: budget
Android phones on metered data. A registry someone checks a few times a week
should not re-download itself each time, and on a bad connection in Biliran the
difference between a cached shell and a cold start is the difference between
using the app and giving up on it.

Phase 1 has shipped: Bilikha installs to a home screen and opens without
browser chrome. Nothing is cached, so the offline half of that argument is still
outstanding — that is Phase 2.

## Why the worker is still not started

A service worker makes caching decisions durable. That is its value and its
danger, and until [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)
landed the app had a bug a worker would have made permanent: a missing chunk
returned the HTML shell with a year-long `immutable` header, and a worker
caching that would have turned a reload-recoverable blank screen into one that
survives reloads.

**The order is the point.** Update-safety first, installability second,
durability last — and each only once the one before it is proven.

## Rules for whoever executes this

1. **The update path from ADR 0040 keeps working.** `build-id.txt` must never be
   served from the worker's cache, and the error boundary's one-shot reload must
   still reach a fresh `index.html`. Verify by removing a chunk mid-session, as
   that ADR did, with the worker installed.
2. **A bad deploy must be recoverable without a factory reset.** Decide
   `skipWaiting` / `clients.claim` deliberately and write down why. Ship a kill
   switch — a worker that can unregister itself on instruction — before shipping
   the worker. Someone in Biliran cannot be talked through clearing site data.
3. **Never cache an API response by default.** The registry is other people's
   live data: an offer that has been withdrawn, a posting that has closed, a
   message that has arrived. Cache the shell and the build output, not
   `/api/*`.
4. **Offline is a state, not an error.** If a page cannot load offline it says
   so in a sentence, the way the empty states do. No broken-robot page.
5. **Installability is not the same as offline.** The manifest and icons
   shipped in Phase 1 without a worker caching anything. Adding one must not
   quietly change what Phase 1 already guarantees.

## Open questions, to settle before Phase 2

- **How does this interact with SSR?** [Constraint 4](../explanation/constraints.md)
  calls SSR the launch blocker. A service worker serving a cached client shell
  in front of a server-rendered page can undo the reason for rendering on the
  server at all. Whichever lands second has to account for the first, and if SSR
  is close, this plan waits.
- **Who is the install prompt for?** A creative checking their own work weekly
  is a different case from a client browsing once. The prompt should not be the
  first thing a first-time visitor sees.

## What Phase 1 does and does not give you

**It does update itself.** With no service worker, an installed Bilikha is a
browser window pinned to a home screen. Every launch fetches `/` afresh —
`index.html` is `Cache-Control: max-age=0, must-revalidate` — so it starts on
whatever build is deployed. A session already open when a deploy lands is
covered by [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md).
This is *more* reliable than the service-worker version, not less, which is the
argument for being in no hurry about Phase 2.

**It does not work offline.** No request is cached, so with no connection the
app shows the browser's offline page. That is deliberate
([rule 5](#rules-for-whoever-executes-this)) and is what Phase 2 is for.

**It shows a real Install button** where the browser offers the prompt, since
Phase 2. Everywhere else — every browser on iOS — the row still tells you where
the browser's own control is.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Installable, nothing cached | 3 / 3 | Done |
| 2. The worker | 5 / 5 | Done |
| 3. Verification | 2 / 3 | Desktop install confirmed; real-phone pass outstanding |

---

# Phase 1 — Installable, nothing cached

The safe half. No service worker, so no new class of stale-content bug.

### Step 1.1 — Manifest and icons

- [x] **Action.** `manifest.webmanifest`: name, short name, description, id,
  start URL, scope, `display: standalone`, and background and theme colours that
  match the light `theme-color` already in `index.html`
  ([plan 0024](./0024-theme-choice.md)).
- [x] **Action.** Icons at 192 and 512, each in an `any` and a `maskable`
  variant, plus a 180px `apple-touch-icon` — iOS ignores the manifest's icons.
- [x] **Verify.** The manifest returns 200 and parses; all four icons load at
  their declared natural sizes; the apple-touch-icon link resolves; no service
  worker is registered.

### Step 1.2 — What it opens to

- [x] **Action.** `start_url` is `/`, which is the pitch signed out and redirects
  to `/directory` signed in ([HomeRoute](../../frontend/src/pages/HomeRoute.tsx)),
  so one entry serves both. `scope` is `/` so every route stays in the app.

### Step 1.3 — Say where the browser keeps the button

The registrant installed nothing, because the only way in was a browser control
they had not noticed — the Install icon was sitting in their address bar in the
screenshot they sent to ask where it was. If the person who commissioned the
feature cannot find it, a carpenter in Naval will not.

- [x] **Action.** `InstallGuide` is a row in the account hub's **Settings**
  group, between Appearance and Security — it is a choice about this device, and
  it is shaped like the other two. The first attempt was three paragraphs at the
  foot of the page and read as an afterthought beside the tidy rows above it.
- [x] **Action.** A `How to install` button reveals the route for the device it
  is read on: the Share sheet on iOS, the browser menu on Android, the address
  bar on desktop. It is labelled `How to install` and not `Install`, because it
  reveals rather than installs — a button that does not do what its label
  promises is worse than no button, and worse than a sentence.
- [x] **Action.** It renders nothing when the app is already installed, and
  nothing in a browser with no install flow. Firefox is deliberately silent —
  pointing at a menu item that does not exist sends somebody hunting through
  settings for something that was never there.
- [x] **Verify.** `installHint` is a pure function of the user agent with tests
  against eight real strings, because the failure is silent: wrong instructions
  look exactly like right ones until somebody follows them.

**It is a signpost, not a button**, and it says so by not looking like one. The
control that actually installs cannot live in the page until Phase 2 — see step
2.1.

### How the icons were made, since it will come up again

The source is `frontend/public/logo.png`, 1024px, with the artwork off-centre
inside it — ink bounds `214,94 646x759`. Centring the *file* would push the bird
off to one side of a circular mask, so the icons centre the *ink*: scaled to 82%
of the square for `any`, 62% for `maskable`, whose outer fifth may be cropped to
any shape.

They are rendered with `scripts/screenshot.mjs` at `dsf: 1`, which this work
added — the default 2 is right for screenshots, which are pictures of something,
and wrong when the output *is* the artefact.

One trap cost most of the time and is worth writing down: the harness emulates a
mobile device below 700px wide, and a page with **no viewport meta** is laid out
at Chrome's 980px default and scaled to fit. Every icon came out at 0.52 scale,
up in the corner, and both a canvas and a CSS implementation produced identical
wrong output — which is what finally pointed at the capture rather than the
drawing. Measure the output, do not look at it: ink centre should be 0.5, 0.5.

---

# Phase 2 — The worker

Done, and scoped to one thing: the install button. It caches nothing. Offline is
still ahead, and is the harder half.

### Step 2.1 — The install prompt, which is why a worker is needed at all

- [x] **Action.** `useInstallPrompt` holds the event; the Settings row's button
  becomes a real `Install` when it has one, and stays the `How to install`
  disclosure everywhere it does not — which is every browser on iOS, where the
  event does not exist and the Share sheet is the route.
- [x] **Note what a button cannot do.** `prompt()` opens the *browser's* dialog
  and the person still confirms. No website can install itself, on any browser.
  Two taps is the floor, not a limitation to engineer around.
- [x] **Why this moved out of Phase 1.** Chrome dropped the service-worker
  requirement for *installing from the browser menu* in version 108 on mobile
  and 112 on desktop, which is what makes Phase 1 possible at all. But the
  algorithm that fires `beforeinstallprompt` still requires a service worker
  with a `fetch` handler, so a custom in-app install button cannot work without
  one. Phase 1 therefore ships installability without a prompt: Android installs
  from the browser menu, iOS from Share → Add to Home Screen.
- [x] **Rule revisited, deliberately.** This plan previously said never to add
  an empty `fetch` handler purely to unlock the prompt. That rule was written
  against a worker that *caches*, and the reasoning was that it buys a durable
  cache in front of the update path for nothing. The handler shipped here calls
  `respondWith` never, so there is no cache and nothing in front of anything —
  every request reaches the network exactly as if no worker existed. The
  registrant asked for the button three times; the cost turned out to be a
  worker that cannot affect a single request. Overriding the rule is recorded
  here rather than done quietly.

### Step 2.2 — The kill switch, first

- [x] **Action.** Shipped in its own commit, before `sw.js` existed, so it could
  be tested before there was anything it might have to remove.
- [x] **Action.** It lives in the page, not the worker — `index.html` is always
  fetched from the network, so publishing `off` in `/sw-enabled` unregisters on
  every device at its next launch, with no deploy and no cooperation from a
  worker that may be the thing that is broken.
- [x] **Action.** A failed fetch never reads as `off`; a phone on a bad signal
  would otherwise unregister every time the connection dropped. `?sw=off` does
  the same for one device while the flag stays `on` for everyone else.

### Step 2.3 — What is cached

- [x] **Nothing.** Not the shell, not the build output, not `/api/*`, not
  `build-id.txt`. The `fetch` handler exists because Chrome requires one and is
  otherwise inert. Making it respond is what Phase 3 is, and is a decision, not
  an increment.

### Step 2.4 — Update semantics

- [x] **Decided: `skipWaiting` on install, `clients.claim` on activate.** Both
  are safe here for the same reason: with no cache, a new worker can never
  disagree with the page it takes over. The usual argument against `skipWaiting`
  is a half-swapped cache, and there is no cache.
- [x] **`NewBuildNotice` is untouched.** Build updates are still the page's job,
  exactly as in ADR 0040. The worker has no opinion about versions.

### Step 2.5 — Offline

- [x] **Not attempted, and the row says so.** "It still needs internet" is in
  the install copy, so nobody installs it expecting something it does not do.
  Rule 4 applies to Phase 3, where offline becomes real.

---

# Phase 3 — Verification

### Step 3.1 — The ADR 0040 scenario, with a worker installed

- [x] **Verified.** With the worker active and controlling the page, removing a
  route chunk and navigating to it gave `nav type=reload`, the guard set, and
  the message rather than a loop — identical to the run without a worker.
  Restoring the chunk rendered the page and cleared the guard, still controlled.
- [x] **Verified.** Cache Storage is empty after activation.
- [x] **Verified.** Flag set to `off`: registrations drop to 0 on next load and
  the controller is gone after a reload, with the app working throughout. Set
  back to `on`: it registers again. `?sw=off` unregisters that device alone.

### Step 3.2 — A real phone

- [x] **Confirmed on a real browser.** Headless Chrome does not fire
  `beforeinstallprompt` — it has no install UI — so every automated run fell
  back to the disclosure and this branch could not be checked here. The
  registrant saw the real `Install` button on Brave for Windows on 2026-09-23.
- [x] **And it found two bugs headless could not.** First, the button and the
  where-to-find-it fallback on screen together: the fallback appears when the
  browser's dialog is dismissed, and Chrome then fires the event again,
  restoring the button while the fallback stayed. Fixed — a new event clears the
  declined state, and the fallback is gated on there being no button.
- [x] **Second, and worse: the button appeared only by luck.** The listener for
  `beforeinstallprompt` lived in a `useEffect` inside `InstallGuide`, which is
  rendered by `AccountPage` — a lazy route chunk (plan 0031). The event fires
  once, early, and nothing was listening until that chunk had downloaded and
  mounted, so it was usually lost. It worked the first time the registrant
  looked and not the second, which is exactly what a race looks like from the
  outside. `lib/install-prompt-store.ts` now listens from `main.tsx`, during the
  first script evaluation, and hands the event to whatever mounts later.
- [x] **Verify.** Fire `beforeinstallprompt` on `/directory`, where the account
  chunk has never mounted, then navigate to `/account`: the row renders
  `["Install"]` with no fallback text. Before the change that event was gone.
- [ ] **Verify.** Install on a budget Android, launch from the home screen, use
  it on a throttled connection. Emulated Chrome is not a phone, which
  [plan 0014](./0014-dark-mode.md) and [plan 0024](./0024-theme-choice.md) both
  say for the same reason.

### Step 3.3 — Full pass

- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0.

---

## Acceptance

- Bilikha installs to a home screen and launches without browser chrome.
- A deploy still costs an open session one reload, worker or not.
- No API response is served from a cache.
- A worker can be unregistered without the user clearing site data.

## Follow-ups

| Item | Why deferred |
|---|---|
| Push notifications | [Plan 0018](./0018-web-push.md), deferred by the registrant. A service worker is a prerequisite, so that plan unblocks when this one lands |
| Background sync for messages | Only worth it once offline is real, and it needs its own decision about what a queued message means to the person expecting it |
