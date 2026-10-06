# 0045. Responsive on every screen

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [plan 0044](./0044-messaging-redesign.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [constraints §3](../explanation/constraints.md)

## Goal

Every page works on small phones (320–360px wide), large phones, tablets and
phones held in landscape — no sideways scroll, nothing squeezed, every control
at least 44px on a touch screen. Presentation only.

## What was found

An automated sweep loaded 33 routes (13 signed out, 20 signed in as an admin
creative) at ten sizes — 320×568, 360×740, 390×844, 430×932, 568×320,
740×360, 844×390, 768×1024, 1024×768 and 1280×800 — and measured horizontal
overflow, controls under 44px, and headings.

- **No page overflowed sideways at any size.**
- **Squeezed, not overflowing** (found on a real 360dp phone): the Account
  Mode control wrapped into two lines; the offer page's rating cut the
  creative's name to one letter.
- **Phones in landscape** count as wider than `sm`, so compact 36px controls
  meant for a mouse appeared on touch screens; the pinned header, 16:9 hero
  and fixed action bar left no room for content at 320px tall.
- **Headings:** Directory, History and Notifications had no `h1`.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Sweep | 1 / 1 | Done |
| 2. Fixes | 1 / 1 | Done |
| 3. Real devices | 0 / 1 | Not started |

---

## Phase 1 — Sweep

### Step 1.1 — Measure every route at every size

- [x] **Action.** 330 checks across 33 routes and ten sizes.
- [x] **Verify.** Overflow, tap-target and heading results recorded above.

## Phase 2 — Fixes

### Step 2.1 — Fix what the sweep and the phone found

- [x] **Action.**
  - Segmented controls never wrap; on phones they fill the row.
  - Settings rows stack their control under the text.
  - Offer page: the rating sits under the name.
  - `short:` variant (height ≤ 30rem): header and staging banner scroll
    away, sticky sub-headers pin to the top, the offer hero caps at 10rem, the
    profile cover lowers.
  - Compact sizes are mouse-only (`pointer-fine:`), not width-based.
  - `.u-tap` gives small links a 44px touch target without changing them.
  - 40px controls raised to 44px; `h1` on Directory, History, Notifications.
- [x] **Verify.** `npm run typecheck`, `npm run lint`, tests, the build and
  `npm run check:bundle` pass.

## Phase 3 — Real devices

### Step 3.1 — Check on hardware

- [ ] **Action.** A budget Android phone in Messenger's in-app browser,
  portrait and landscape; a tablet.
- [ ] **Verify.** Nothing squeezed; every control easy to hit.

---

## Acceptance

- [x] No horizontal overflow at any listed size.
- [ ] Checked on a real phone and tablet.

## Follow-ups

The agreement page was not swept — the local database has no agreement.
