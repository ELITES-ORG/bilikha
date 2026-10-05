# 0042. The creative profile page

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [plan 0041](./0041-offers-as-a-catalog.md) ·
  [ADR 0022](../decisions/0022-offers-replace-portfolio.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

`/creatives/:slug` reads as a creative's own page: a cover band, the person,
one way to message them, and their work in four sections — Services,
Portfolio, Reviews, About — with a supporting sidebar from `lg`. Presentation
only: the route, the profile and ratings requests, the contact composer and
the lightbox are unchanged.

## Scope

**In scope**
- An `underline` variant for `Tabs`, with tabpanel ids and arrow-key movement.
- The profile page: cover, identity, actions, tabbed sections (`?tab=`),
  sidebar, skeleton.

**Out of scope** — no data exists for these; each needs backend work first
- Cover photo, verified badge, social links, response time, availability.
- Follow, posts, followers, following.
- A per-star rating histogram (the summary has only an average and a count).

**Removed on purpose**
- "Contact about this offer" on each offer. Cards link to the offer page,
  whose "Inquire now" attaches the offer; the profile keeps one Message.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Tabs underline variant | 1 / 1 | Done |
| 2. Profile page | 1 / 1 | Done |
| 3. Browser check | 0 / 1 | Partial — signed out checked at ten widths; signed in and owner views not yet |
| 4. Bundle | 1 / 1 | Done — JS budget raised |

---

## Phase 1 — Tabs underline variant

### Step 1.1 — Add the variant

- [x] **Action.** `components/ui/Tabs.tsx`: `variant="underline"`, `idPrefix`
  for tab and panel ids, roving `tabIndex` with arrow, Home and End keys.
- [x] **Verify.** Existing pill call sites unchanged; `npm run typecheck`.

## Phase 2 — Profile page

### Step 2.1 — Rebuild the layout

- [x] **Action.** `pages/CreativeProfilePage.tsx` with `OfferCard` for
  services; `ProfileRatings` heading renamed to Reviews and its top margin
  moved to the page.
- [x] **Verify.** One `h1`, no horizontal overflow, 1/2/3 card columns at
  360–1920px; each `?tab=` opens its panel.

## Phase 3 — Browser check

### Step 3.1 — Signed-in views

- [ ] **Action.** Message opens the composer under the header and sends; the
  owner sees Edit profile and Add offer; portfolio lightbox returns focus.
- [ ] **Verify.** Screenshots at 375 and 1280, light and dark.

## Phase 4 — Bundle

### Step 4.1 — Get under the first-load budget

- [x] **Action.** Measured 158.05 kB JS gzip against 156.80 (CSS 16.97 /
  17.20 is fine). Lazy-loading the profile page would have measured
  152.82 kB, but profiles are the page shared on Facebook (constraints §4),
  so it stays eager (plan 0031 rule 3). Decision: raise the JS budget to
  159100 in `frontend/bundle-budget.json`, in its own commit.
- [x] **Verify.** `npm --prefix frontend run build && npm run check:bundle`
  passes.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [x] `npm run check:bundle` passes.
- [ ] Signed-in and owner views checked in a browser.

## Follow-ups

Cover photos, follows and a rating distribution, each with a backend plan.
