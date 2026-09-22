# 0036. The PWA

- **Status:** Ready — deliberately after [ADR 0040](../decisions/0040-a-deploy-must-not-break-an-open-tab.md)
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

Bilikha is not a PWA today. There is no manifest, no service worker, and no
`vite-plugin-pwa` — only `theme-color` and the icons, which came from
[plan 0024](./0024-theme-choice.md) for the address bar rather than for
installability.

## Why this is not started yet

A service worker makes caching decisions durable. That is its value and its
danger, and until ADR 0040 landed the app had a bug that a service worker would
have made permanent: a missing chunk returned the HTML shell with a year-long
`immutable` header, and a worker caching that would have turned a
reload-recoverable blank screen into one that survives reloads.

**The order is the point.** Update-safety first, durability second.

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
5. **Installability is not the same as offline.** Manifest, icons and an install
   prompt can ship without a worker caching anything, and that is the smaller,
   safer half. Consider shipping it first.

## Open questions, to settle before Phase 2

- **How does this interact with SSR?** [Constraint 4](../explanation/constraints.md)
  calls SSR the launch blocker. A service worker serving a cached client shell
  in front of a server-rendered page can undo the reason for rendering on the
  server at all. Whichever lands second has to account for the first, and if SSR
  is close, this plan waits.
- **Who is the install prompt for?** A creative checking their own work weekly
  is a different case from a client browsing once. The prompt should not be the
  first thing a first-time visitor sees.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Installable, nothing cached | 0 / 3 | Not started |
| 2. The worker | 0 / 4 | Not started |
| 3. Verification | 0 / 3 | Not started |

---

# Phase 1 — Installable, nothing cached

The safe half. No service worker, so no new class of stale-content bug.

### Step 1.1 — Manifest and icons

- [ ] **Action.** A web app manifest: name, short name, start URL, display
  `standalone`, background and theme colours that agree with the two
  `theme-color` meta tags already in `index.html` — light and dark, per
  [plan 0024](./0024-theme-choice.md).
- [ ] **Action.** Maskable icons at the sizes Android actually uses, plus
  `apple-touch-icon`, which the head currently has none of.

### Step 1.2 — What it opens to

- [ ] **Action.** Decide the start URL. `/` is the pitch when signed out and
  redirects to `/directory` when signed in
  ([HomeRoute](../../frontend/src/pages/HomeRoute.tsx)), so it behaves correctly
  for both — confirm that holds from a home-screen launch, where there is no
  referrer.

### Step 1.3 — The prompt

- [ ] **Action.** Hold `beforeinstallprompt` and offer installation somewhere it
  makes sense for a returning user, not on a first visit.

---

# Phase 2 — The worker

Do not start this until the open questions above are settled.

### Step 2.1 — The kill switch, first

- [ ] **Action.** Ship the ability to unregister before shipping the worker.
  Rule 2 exists because the failure mode is a phone that cannot be reached.

### Step 2.2 — What is cached

- [ ] **Action.** The shell and hashed build output. Not `/api/*` (rule 3), and
  not `build-id.txt` (rule 1).

### Step 2.3 — Update semantics

- [ ] **Action.** Decide and document `skipWaiting` / `clients.claim`. Reuse the
  existing `NewBuildNotice` rather than adding a second, differently-worded
  prompt for the same thing.

### Step 2.4 — Offline

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
