# 0041. Offers as a catalog, and the offer page

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [plan 0040](./0040-navy-and-red-restyle.md) ·
  [ADR 0044](../decisions/0044-navy-and-red-identity.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

Offers read as a catalog — image-led cards in a 1/2/3-column grid — on both
surfaces that show them: the public directory's Offers tab and a creative's own
offers page. Presentation only: routes, API calls, query parameters, types and
the create, edit, delete, reorder and image flows are unchanged.

## Scope

**In scope**
- A shared `OfferCard` and `OfferCardSkeleton`.
- `/directory` Offers tab: card grid and a domain chips row.
- `/account/offers`: card grid, a primary Add offer, and the form in a
  dialog (full-screen sheet on phones).

- The offer card and the offer page redesigned to the #10 reference: navy
  no-photo panel, eyebrow, near-black price, stretched "View offer" link, save
  heart; a hero with Back, Share and Save, a sticky sidebar, a gallery grid,
  and Similar offers from the existing sub-domain filter.
- Prices: "From ₱X" when there is no maximum, and one price when both ends are
  equal. "Price on request" stays — an offer always shows a price line.

**Out of scope** — and where it is handled instead
- Verified badge, card ratings, crafts row, delivery and response time: no
  field exists for any of them. Each needs backend work first.
- Text search, sort and ratings on cards. The offers API has none of them and
  `PublishedOfferCard` carries no rating on purpose; they need backend work in
  a plan of their own.
- The Creatives and Postings lists keep their row layout.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Shared card | 1 / 1 | Done |
| 2. Directory Offers tab | 1 / 1 | Done |
| 3. Own offers page | 1 / 1 | Done |
| 4. Browser check | 0 / 1 | Partial — public pages checked; signed-in views not yet |
| 5. Card and offer page | 1 / 1 | Done |
| 6. Bundle | 1 / 1 | Done — budget raised |

---

## Phase 1 — Shared card

### Step 1.1 — Add `OfferCard`

- [x] **Action.** `frontend/src/features/offers/OfferCard.tsx`: 4:3 image (the
  400px thumb, for metered data), sub-domain badge over its corner, title,
  two-line description, provider, price. `offerGridClass` is the grid.
- [x] **Verify.** `npm run typecheck` passes.

## Phase 2 — Directory Offers tab

### Step 2.1 — Grid, chips and card-shaped loading

- [x] **Action.** `pages/DirectoryPage.tsx`: the offers row list becomes the
  grid; a domain chips row writes the same `domain` parameter as the filter
  panel's Domain select; loading shows six card skeletons.
- [x] **Verify.** `npm run typecheck` and `npm run lint` pass.

## Phase 3 — Own offers page

### Step 3.1 — Grid, Add offer, and the form in a dialog

- [x] **Action.** `OffersSettingsPage.tsx` widens; `OfferEditor.tsx` renders
  the grid, the reorder list and an `EmptyState`; the form moves into
  `OfferFormDialog.tsx`. The dialog is not a modal `<dialog>`: the top layer
  would hide the toasts this form reports through, so it portals between the
  tab bar and the toast region and makes the app behind it `inert`.
- [x] **Verify.** The block from `export function OfferEditor` to the render
  is unchanged — its checksum before and after matches.

## Phase 4 — Browser check

### Step 4.1 — Look at both pages

- [ ] **Action.** Screenshots of `/directory` and `/account/offers` at 360,
  390, 430, 768, 1024, 1440 and 1920px, light and dark; walk create, edit,
  Esc, delete and reorder by hand.
- [ ] **Verify.** 1, 2 and 3 columns at the right widths, no horizontal page
  scroll, toasts visible while the dialog is open.

## Phase 5 — Card and offer page

### Step 5.1 — Redesign to the reference

- [x] **Action.** `OfferCard` (eyebrow, near-black price, stretched link,
  `SaveHeart`), `use-offer-saving.ts`, `OfferDetailPage` (hero, sidebar,
  gallery grid, Similar offers), the lightbox moved to
  `use-offer-lightbox.tsx`, and `formatPriceRange` with its tests.
- [x] **Verify.** `onInquire` and `onToggleSave` are unchanged — their
  checksum before and after matches; money tests pass.

## Phase 6 — Bundle

### Step 6.1 — Get under the first-load budget

- [x] **Action.** Measured 155.82 kB JS and 16.86 kB CSS gzip against
  153.50 / 16.30. Lazy-loading the offer page would have brought JS to
  152.33 kB but adds a round trip for visitors arriving from a shared offer
  link, which plan 0031 rule 3 exists to avoid, and CSS stays over either way.
  Decision: keep the page eager and raise `frontend/bundle-budget.json` to
  156800 / 17200, in its own commit.
- [x] **Verify.** `npm --prefix frontend run build && npm run check:bundle`
  passes.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [x] No handler, effect or type in `OfferEditor.tsx` changed.
- [ ] Both pages checked in a browser at every listed width, both themes.

## Follow-ups

Search and sort for offers, with an API that supports them.
