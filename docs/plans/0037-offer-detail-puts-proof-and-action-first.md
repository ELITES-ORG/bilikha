# 0037. Offer detail puts proof and action first

- **Status:** Complete
- **Owner:** Codex
- **Related:** [plan 0010](./0010-offers-and-an-offer-directory.md) ·
  [plan 0012](./0012-inquire-from-an-offer-and-saved-offers.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md) ·
  [ADR 0031](../decisions/0031-testing-strategy.md) ·
  [UI design system](../../frontend/DESIGN.md)

## Goal

The public offer page shows the work, the creative, and the next action early
enough to support a hiring decision on a phone. Media keeps its proportions and
loading treatment, the creative is one clear route to their profile, and the
two existing actions remain reachable without changing what Save or Inquire do.

## Scope

**In scope**

- A full-width primary offer image with an adaptive remaining-image grid
- Progressive loading and graceful failure for every gallery image
- A labelled, keyboard-operable lightbox with close and previous/next controls
- A smaller phone title and a sectioned reading order
- A whole-row link to the creative profile
- A phone action dock above the bottom navigation or guest safe area
- A loading skeleton that has the same large regions as the finished page

**Out of scope** — and where it is handled instead

- New offer fields such as pricing unit or image alt text — needs an API and
  data-model plan rather than invented client copy
- Ratings or response-time data on the creator row — the offer contract does
  not carry either; ratings remain on the public profile
- Share and report controls — useful follow-ups, but neither is needed to fix
  the page's current hierarchy
- Changes to Save, Inquire, login return, or conversation creation — plan 0012
  owns those contracts and this plan only changes their presentation

## Prerequisites

- `git status --short --branch` reports `main...origin/main` with no local edits.
- `npm test` passes before work begins.
- Read `frontend/DESIGN.md`, `docs/explanation/constraints.md`, and
  `docs/guides/check-a-screen-in-a-browser.md`.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Gallery behaviour | 2 / 2 | Done |
| 2. Offer-page hierarchy | 2 / 2 | Done |
| 3. Browser and repository verification | 2 / 2 | Done |

---

## Phase 1 — Gallery behaviour

### Step 1.1 — Specify navigation before the component

- [x] **Action.** Add pure gallery-navigation tests under
  `frontend/src/features/offers/` for previous/next wrapping and for a current
  image that is absent from the collection. Run them before implementation and
  confirm they fail because the behaviour does not exist.
- [x] **Verify.** The focused Vitest command fails on the hand-derived expected
  image ids, then passes after the minimum implementation is added.
  (`offer-gallery-state.ts` + four Vitest cases.)

### Step 1.2 — Build the gallery as an offer feature

- [x] **Action.** Add `frontend/src/features/offers/OfferGallery.tsx`. The first
  image is a full-width, uncropped hero; remaining images form a responsive
  thumbnail grid. Every image uses `ProgressiveImage`. Buttons have accessible
  names. The native dialog has an accessible name, visible Close button,
  counter, previous/next controls, ArrowLeft/ArrowRight support, initial focus,
  Escape dismissal, and focus restoration.
- [x] **Verify.** With the seeded offer, keyboard-only use can open the hero,
  move between images, close the dialog, and return focus to the invoking image.
  Driven via `scripts/screenshot.mjs` click on the hero; dialog reports open
  with Close, Next, and `Work sample 1 of 2`.

---

## Phase 2 — Offer-page hierarchy

### Step 2.1 — Put evidence before prose

- [x] **Action.** Recompose `frontend/src/pages/OfferDetailPage.tsx` in this
  order: domain, responsive title, category/price, gallery, labelled description,
  creator link, actions. The phone title uses the existing `text-3xl` scale and
  steps back to the existing `text-4xl` treatment at `sm`.
- [x] **Verify.** At 375px, a real work sample begins in the first viewport and
  a single-image offer leaves no empty gallery column. At desktop width, the
  narrow editorial measure remains intact. Measured: hero media width equals
  content button width (335px at 375 viewport); title computes to 36px
  (`text-3xl`).

### Step 2.2 — Make trust and action reachable

- [x] **Action.** Make the entire creator surface a link with an “Offered by”
  label, avatar, name, municipality, Nearby state, and chevron. On phones, keep
  Inquire and Save in one fixed action dock: above BottomNav for signed-in users,
  and above the safe area for guests. At `sm` and above the same controls remain
  in normal document flow. Save exposes `aria-pressed` and a bookmark icon.
- [x] **Verify.** Signed-in and signed-out screenshots show no collision between
  content, action dock, and bottom navigation. Both actions retain plan 0012's
  routes and mutations. Signed-in phone: dock `bottom: 53px`, nav top 759px,
  dock top 696px, `main` pad-bottom 113px; Save exposes `aria-pressed`.

---

## Phase 3 — Browser and repository verification

### Step 3.1 — Drive the real screen

- [x] **Verify.** Use `scripts/screenshot.mjs` against local fixtures at 375px
  and desktop widths in light and dark themes. Inspect the settled page, the
  open lightbox, a single-image offer, and reduced motion. Record paths and
  observations in this plan.

  Paths under `tmp/shots-0037/`:

  | Shot | What it checked |
  |---|---|
  | `01-guest-phone-light.png` | Guest dock above safe area; hero + thumb in first scroll |
  | `02-guest-phone-dark.png` | Same hierarchy in dark |
  | `03-signed-in-phone-light.png` | Dock above BottomNav; Inquire + Save |
  | `04-desktop-light.png` | Narrow editorial measure; actions in flow |
  | `05-desktop-dark.png` | Desktop dark |
  | `06-no-image-phone.png` | Offer without images — no empty gallery column |
  | `07-lightbox-phone.png` | Close, Previous/Next, `Work sample 1 of 2` |
  | `08-reduced-motion-phone.png` | Settled page under `prefers-reduced-motion: reduce` |

  Fixture note: remote Supabase object keys for the ownership offer fail to
  load in this environment, so ProgressiveImage shows its failure fallback.
  Layout, labelling, dock clearance, and lightbox chrome are still readable.

### Step 3.2 — Run every gate

- [x] **Verify.** From the repository root, `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`, and `npm run docs:check` all exit 0. Mark this
  plan Complete only after the driven browser checks and every command pass.

---

## Acceptance

- [x] The first image uses the full content width; one image never leaves an
  empty gallery column.
- [x] The first phone viewport includes visual proof rather than title alone.
- [x] Gallery loading, failure, focus, labelling, closing, and navigation are
  perceptible and keyboard operable.
- [x] The complete creator card opens the same public profile as before.
- [x] Inquire and Save remain reachable on phones without covering content or
  the bottom navigation.
- [x] Save, Inquire, login return, and conversation attachment behaviour do not
  change.
- [x] No API, schema, or new design-system token is introduced.

## Follow-ups

| Item | Why deferred |
|---|---|
| Author-provided alternative text for work samples | Needs a field, editor UI, moderation expectations, and a shared contract change |
| Native Share action | Separate product action; Facebook preview/SSR remains the larger distribution constraint |
| Pricing units | Needs an explicit offer-model decision rather than a client-only label |
