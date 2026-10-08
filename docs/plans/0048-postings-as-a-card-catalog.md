# 0048. Client postings as a card catalog

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [plan 0041](./0041-offers-as-a-catalog.md) ·
  [plan 0046](./0046-responsive-on-every-screen.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

A creative's Directory shows client postings as cards that are quick to scan
from 320px to large desktop: what the work is, its craft, the budget, where,
how long is left, and who posted it. Presentation only — the feed request,
filters, pagination, empty state and the posting page are unchanged.

## Scope

**In scope**
- `features/postings/PostingCatalogCard.tsx`: card, skeleton and grid.
- `pages/DirectoryPage.tsx`, the creative view only: the grid, card-shaped
  loading, and a quieter "nearby first" line.

**Out of scope** — the data or feature does not exist
- A posting image: postings have none, so cards lead with a band naming the
  domain rather than a placeholder that would be the same on every card.
- Sort and a grid/list switch: the Directory has neither.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Card and grid | 1 / 1 | Done |
| 2. Browser check | 0 / 1 | Not started |

---

## Phase 1 — Card and grid

### Step 1.1 — Build the card and use it in the Directory

- [x] **Action.** One link per card to `/postings/:id`; deadline tone from the
  existing `expiryTone()`; columns from an 18rem minimum card width.
- [x] **Verify.** `npm run typecheck` and `npm run lint` pass.

## Phase 2 — Browser check

### Step 2.1 — Sweep every size, with long content

- [x] **Action.** 320 to 1920px and three landscape sizes, signed in as a
  creative; long title, category, client, location and price injected in the
  browser.
- [x] **Verify.** No horizontal overflow; cards at least 280px wide wherever
  there are two or more columns; the last card clears the bottom navigation.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [x] The sweep passes at every listed size.

## Follow-ups

None.
