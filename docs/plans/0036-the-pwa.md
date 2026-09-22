# 0036. The PWA

- **Status:** Phase 1 complete
- **Phases 2-3:** Ready, and deliberately not started
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

**It does not show an in-app install button** — see step 2.1. It does tell you
where your browser's one is (step 1.3), which is the most a page without a
service worker can do.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Installable, nothing cached | 3 / 3 | Done |
| 2. The worker | 0 / 5 | Not started |
| 3. Verification | 0 / 3 | Not started |

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

- [x] **Action.** `InstallGuide` on the account page says where that control is,
  in the words of the device it is being read on: the Share sheet on iOS, the
  browser menu on Android, the address bar on desktop.
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

Do not start this until the open questions above are settled.

### Step 2.1 — The install prompt, which is why a worker is needed at all

- [ ] **Action.** Hold `beforeinstallprompt` and offer installation somewhere it
  makes sense for a returning user, not on a first visit.
- [ ] **Why this moved out of Phase 1.** Chrome dropped the service-worker
  requirement for *installing from the browser menu* in version 108 on mobile
  and 112 on desktop, which is what makes Phase 1 possible at all. But the
  algorithm that fires `beforeinstallprompt` still requires a service worker
  with a `fetch` handler, so a custom in-app install button cannot work without
  one. Phase 1 therefore ships installability without a prompt: Android installs
  from the browser menu, iOS from Share → Add to Home Screen.
- [ ] **Do not** add an empty `fetch` handler purely to unlock the prompt. That
  is the exact workaround Chrome cited when it removed the requirement, and it
  buys a durable cache in front of the update path for nothing.

### Step 2.2 — The kill switch, first

- [ ] **Action.** Ship the ability to unregister before shipping the worker.
  Rule 2 exists because the failure mode is a phone that cannot be reached.

### Step 2.3 — What is cached

- [ ] **Action.** The shell and hashed build output. Not `/api/*` (rule 3), and
  not `build-id.txt` (rule 1).

### Step 2.4 — Update semantics

- [ ] **Action.** Decide and document `skipWaiting` / `clients.claim`. Reuse the
  existing `NewBuildNotice` rather than adding a second, differently-worded
  prompt for the same thing.

### Step 2.5 — Offline

- [ ] **Action.** A page that cannot load offline says so in a sentence
  (rule 4).

---

# Phase 3 — Verification

### Step 3.1 — The ADR 0040 scenario, with a worker installed

- [ ] **Verify.** Remove a route chunk mid-session and navigate to it. One
  reload, no loop, and the app recovers when the chunk exists again — the same
  result as without the worker.

### Step 3.2 — A real phone

- [ ] **Verify.** Install it on a budget Android, launch from the home screen,
  and use it on a throttled connection. Emulated Chrome is not a phone, which
  [plan 0014](./0014-dark-mode.md) and [plan 0024](./0024-theme-choice.md) both
  say for the same reason.

### Step 3.3 — Full pass

- [ ] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green.

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
