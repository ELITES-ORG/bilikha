# 0030. Something to look at while it boots

- **Status:** Complete
- **Owner:** implementing agent
- **Related:** [plan 0024](./0024-theme-choice.md) (the pre-paint script this sits beside) ·
  [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [ADR 0010](../decisions/0010-theme-static-tokens.md) ·
  [constraints 3 and 4](../explanation/constraints.md)

## Goal

Between first paint and React mounting, the page shows a quiet looping
indicator instead of an empty coloured rectangle. On a fast connection nobody
ever sees it.

## The measurement

`index.html` ships `<div id="root"></div>` — literally empty — and a 617 KB
JavaScript bundle. Everything visible waits on that bundle. Measured against the
built app on 2026-09-22, recording every animation frame from first paint:

| Link | First paint | First text | Painted but empty |
|---|---|---|---|
| 300ms latency, 700 kbps | 658ms | 1014ms | **356ms** |
| 800ms latency, 300 kbps | 1652ms | 2498ms | **846ms** |

A budget Android on metered data in Biliran — [constraint 3](../explanation/constraints.md)'s
actual audience — is worse than the second row, on a cold cache.

**356ms is also why the indicator must not appear immediately.** Something that
flashes for a third of a second and vanishes reads as a glitch, and is worse
than the blank it replaced.

## Scope

**In scope**
- Markup inside `#root` in `index.html`, styled inline, that React replaces when
  it mounts.
- A looping indicator that fades in only after the wait becomes noticeable.

**Out of scope**
- **Server-side rendering.** This does not solve, substitute for, or reduce the
  need for it. [Constraint 4](../explanation/constraints.md) names shipping
  public profiles without SSR as *the launch blocker*, because Facebook's
  scraper does not run JavaScript — a spinner is invisible to a scraper. Do not
  let this plan close that one.
- Route-level skeletons. Those belong to the pages, which already have
  `Skeleton`, and this runs before the router exists.
- Shrinking the 617 KB bundle. Worth doing and a different plan.

## Rules for whoever executes this

1. **Inline styles, not classes.** This renders before the stylesheet has
   necessarily parsed. A `class` that resolves to nothing leaves an unstyled
   blob, which is worse than the blank screen.
2. **It must not appear before ~400ms.** Measured typical wait is 356ms. Use a
   CSS `animation-delay` on opacity so the element is present but invisible from
   the start — do not schedule it with `setTimeout`, which is script the browser
   may be too busy to run when it matters most.
3. **Transform and opacity only.** [Constraint 3](../explanation/constraints.md):
   *motion is transform and opacity only; animating layout properties stutters*.
   No width, height, left or margin.
4. **Respect `prefers-reduced-motion`.** A static mark, not a moving one, for
   anyone who asked for that.
5. **It must not pretend to be the page.** `Skeleton`'s own note applies: a
   placeholder that does not match what replaces it produces a jolt, and this
   one cannot know which route is coming. A neutral mark, not a fake layout.
6. **Do not write removal code.** `createRoot(...).render(...)` replaces the
   children of `#root`. If you find yourself calling `remove()`, something else
   is wrong.
7. **The colours are the exception, and they have a home already.** The theme
   script above it already carries `LIGHT_PAPER` and `DARK_PAPER` as literals
   with a comment that they must stay in step with `theme-preference.ts`. Use
   the same constants; do not add a third copy elsewhere.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The indicator | 3 / 3 | Done |
| 2. Verification | 3 / 3 | Done |

---

# Phase 1 — The indicator

### Step 1.1 — Markup and styles

- [x] **Action.** Inside `#root` in `frontend/index.html`, a single element
  centred in the viewport, with a `<style>` block in `<head>` for its keyframes.
  Everything inline or in that block; nothing from the app stylesheet.
- [x] **Action.** It inherits the theme the pre-paint script already applied —
  on a dark-pinned device the indicator is light-on-dark from the first frame,
  with no flash of the other theme. Plan 0024 established that the script runs
  before paint; this depends on it.
- [x] **Action.** `role="status"` with a visually hidden *Loading Bilikha*, so a
  screen reader is told rather than left silent.

### Step 1.2 — The delay

- [x] **Action.** Opacity 0, animating to 1 with a ~400ms delay, then looping.
  Present in the DOM from the start; invisible until the wait is real.
- [x] **Why not `setTimeout`.** The main thread is parsing a 617 KB bundle at
  exactly that moment. A timer is the least reliable thing available; CSS
  animation runs off the main thread.

### Step 1.3 — The loop

- [x] **Action.** A slow, quiet loop — opacity or transform only (rule 3).
  Nothing spinning fast or bouncing; this is a registry for a province of
  180,000, not a game loader.
- [x] **Action.** Under `prefers-reduced-motion: reduce`, the loop stops and the
  mark is simply visible.

---

# Phase 2 — Verification

### Step 2.1 — It shows when it should

- [x] **Verify.** Record frames against the **built** app on 800ms latency /
  300 kbps, as the measurement above was taken. The indicator is visible during
  the blank window. `scripts/screenshot.mjs` takes `record` and `throttle`;
  `docs/guides/check-a-screen-in-a-browser.md` has the shape of it.

### Step 2.2 — It does not show when it should not

- [x] **Verify.** On an unthrottled local load, no frame has the indicator at
  full opacity. This is the check that matters most — a loader that flashes on
  every fast load is the failure this plan is trying to avoid.

### Step 2.3 — Full pass

- [x] **Verify.** Both themes, light and dark, with no flash of the wrong one at
  the first frame — the same check plan 0024 step 4.2 made for the theme itself.
- [x] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Grep the diff for `setTimeout`, and for any animated width,
  height, top, left or margin. CI green on `35655007448` (2026-09-22).

---

## Acceptance

- A slow load shows a quiet indicator within the blank window.
- A fast load shows nothing at all.
- It matches the pinned theme from the first frame.
- Reduced motion is honoured, and a screen reader is told the page is loading.
- No removal code, no timers, no layout animation.

## Follow-ups

| Item | Why deferred |
|---|---|
| Server-side rendering | The real fix for an empty first paint, and the launch blocker constraint 4 names. A spinner does nothing for Facebook's scraper |
| Splitting the 617 KB bundle | The build already warns about it. Shortening the wait beats decorating it, and it is its own plan |
| Route-level skeletons | The pages have `Skeleton` already; this plan runs before the router exists |
