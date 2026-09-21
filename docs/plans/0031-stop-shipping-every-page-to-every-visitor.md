# 0031. Stop shipping every page to every visitor

- **Status:** Ready
- **Owner:** implementing agent
- **Related:** [plan 0030](./0030-something-to-look-at-while-it-boots.md) (the blank this removes) ·
  [constraint 3](../explanation/constraints.md) (budget Android, metered data) ·
  [constraint 4](../explanation/constraints.md) (SSR is still the launch blocker)

## Goal

Someone opening the landing page downloads the landing page, not the admin
moderation queue. The blank window before React mounts shrinks far enough that
there is nothing left to decorate.

## Why, measured

`App.tsx` eagerly imports **31 page modules**. Every visitor downloads all of
them before anything renders — including six admin screens, the style guide, the
conversation thread and the agreement record.

Against **production**, cold cache, recording every frame:

| Load | Blank before React mounts |
|---|---|
| 400ms latency, 600 kbps | **355ms** |
| 800ms latency, 300 kbps | **608ms** |

[Plan 0030](./0030-something-to-look-at-while-it-boots.md) put a mark in that
window, and it works on the slow row. On the typical row it never appears,
because the window is 355ms and the mark waits 400ms — deliberately, so it does
not flash. **Decorating a wait this short cannot succeed; shortening it can.**

The heaviest modules, none of which the landing page needs:

| Module | Source |
|---|---|
| `DirectoryPage` | 32 KB |
| `ConversationPage` | 28 KB |
| `StyleGuidePage` | 20 KB — an internal design reference, shipped to every visitor |
| `HistoryPage` | 19 KB |
| `pages/admin/*` (6 files) | 40 KB |

## Scope

**In scope**
- Route-level code splitting with `React.lazy` and a `Suspense` boundary.
- A fallback that is not nothing.
- A measured before/after of the initial chunk.

**Out of scope**
- **Server-side rendering.** Still [constraint 4](../explanation/constraints.md)'s
  launch blocker. This makes the app appear sooner for people and does nothing
  for Facebook's scraper, which does not run JavaScript. Splitting the bundle
  must not be recorded as progress on that.
- Removing the boot mark. It still earns its place on the slow row, and Biliran
  has those connections.
- Swapping libraries or changing what any page renders.

## Prerequisites

- `npm run build` and note the current initial JS chunk. Measured 2026-09-22:

  ```
  dist/assets/index-DMeMl6j-.js   632.14 kB │ gzip: 180.17 kB
  dist/assets/index-XkrQPenT.css   67.63 kB │ gzip:  12.52 kB
  ```

  **Compare against the build's own figure, not the file size on disk** — they
  differ, and mixing them makes a before/after meaningless. Gzip is the number
  that reaches a phone on metered data, so report both.
- Read [plan 0030's audit](./0030-something-to-look-at-while-it-boots.md). It
  ends with the lesson this plan can most easily repeat.

## Rules for whoever executes this

1. **A Suspense fallback of `null` recreates the bug you are fixing.** Plan 0030
   measured it: React mounted, replaced the boot mark with an empty shell, and
   the screen went blank again. A lazy route whose fallback renders nothing does
   the same thing on every navigation. The fallback is mandatory and it is the
   most important line in this plan.
2. **The fallback waits before it shows, for the same reason the boot mark
   does.** A cached chunk resolves in single-digit milliseconds; a spinner that
   flashes on every navigation is worse than the navigation. Delay it the same
   way — CSS `animation-delay`, not a timer.
3. **Do not split what the first paint needs.** The router, the providers, the
   shared chrome and the landing route stay in the initial chunk. Splitting the
   landing page adds a round trip to the exact load this plan exists to speed up.
4. **Measure, do not estimate.** Report the initial chunk before and after in
   KB. "Should be smaller" is not a result.
5. **`/styleguide` is internal.** It is 20 KB of design reference in every
   visitor's download. It should be among the first things to leave, and it
   never needs prefetching.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The fallback | 0 / 2 | Not started |
| 2. Split the routes | 0 / 3 | Not started |
| 3. Measure | 0 / 3 | Not started |

---

# Phase 1 — The fallback

### Step 1.1 — Something to show while a chunk arrives

- [ ] **Action.** A `RouteFallback` component: the shared chrome that is already
  loaded, plus a quiet mark in the content area. Not a blank, not a full-page
  spinner that replaces the header the person can already see.
- [ ] **Action.** Invisible for the first ~250ms, then fading in — a cached
  chunk must never produce a flash. Shorter than the boot mark's 400ms because
  a chunk is smaller than a cold bundle.
- [ ] **Action.** `prefers-reduced-motion` stops the movement and keeps the
  delayed fade, matching `motion.css` and the correction made to plan 0030.

### Step 1.2 — One boundary, high up

- [ ] **Action.** A single `Suspense` inside `BrowserRouter`, wrapping `Routes`.
  Per-route boundaries would mean the chrome unmounts and remounts on every
  navigation.
- [ ] **Verify.** Navigating between two split routes keeps the header and the
  bottom bar mounted throughout. If they flicker, the boundary is in the wrong
  place.

---

# Phase 2 — Split the routes

### Step 2.1 — The ones nobody browsing needs

- [ ] **Action.** `React.lazy` for: all six `pages/admin/*`, `StyleGuidePage`,
  `RegisterPage`, the onboarding pages, `ConversationPage`, `HistoryPage`,
  `AgreementPage`, `account/*`, `PostingComposePage`, `MyPostingsPage`.
- [ ] **Why these first.** Every one is behind a sign-in, an admin role, or a
  deliberate navigation. A visitor reading the landing page reaches none of them.

### Step 2.2 — What stays eager

- [ ] **Action.** `HomeRoute`, the providers, the router, `SiteHeader`, the
  bottom navigation, `RequireAuth`, the UI primitives and `NotFoundPage` stay in
  the initial chunk. Rule 3.
- [ ] **Decide and record.** `DirectoryPage` is 32 KB and is the first tap from
  the landing page. Splitting it shrinks the initial chunk most; keeping it eager
  makes the commonest navigation instant. Pick one, measure both, and write down
  which and why — this is the one genuine trade-off in the plan.

### Step 2.3 — Nothing regressed

- [ ] **Verify.** Every route still loads, including the admin ones and a
  deep-linked `/agreements/:id`.
- [ ] **Verify.** `RequireAuth` still redirects before a protected chunk is
  fetched. A guard that downloads the admin bundle and *then* redirects has
  leaked the existence of the surface and wasted the bytes.

---

# Phase 3 — Measure

### Step 3.1 — The number

- [ ] **Verify.** Initial JS chunk before and after, in KB, from `npm run build`.
  Report both. Rule 4.

### Step 3.2 — The window it was for

- [ ] **Verify.** Against **production or a local preview of the built app**,
  cold cache, at 400ms/600kbps: the blank window before React mounts, before and
  after. The 355ms above is the number to beat.
- [ ] **Note.** `scripts/screenshot.mjs` needs `coldCache` for this. Without it
  the scratch profile serves a warm bundle and you will measure a cache hit —
  this cost real time during plan 0030 and the browser guide now says so.

### Step 3.3 — Full pass

- [ ] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Confirm no `Suspense` in the diff has a `null` or absent
  fallback.

---

## Acceptance

- The initial chunk is materially smaller, with both numbers reported.
- The blank window before React mounts is measurably shorter on a cold,
  throttled load of the built app.
- Navigating to a split route shows the chrome and a delayed mark, never a blank
  and never a flash.
- Every route still works, and guards still run before their chunk is fetched.

## Follow-ups

| Item | Why deferred |
|---|---|
| Prefetching on hover or idle | Makes a split route feel instant. Worth it once the split exists and the numbers are known, and it is easy to do badly — prefetching everything is the bundle again, arriving later |
| Server-side rendering | Unchanged by this plan and still the launch blocker constraint 4 names |
| Revisiting the boot mark's 400ms | If this shrinks the typical blank below ~200ms there may be nothing worth marking on a normal connection, and the mark becomes slow-connection-only by circumstance rather than by design |
