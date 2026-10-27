# 0059. Translate the empty states

- **Status:** Complete
- **Owner:** userMarcPaul
- **Related:** [ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md) ·
  [plan 0050](./0050-language-choice-and-the-first-translated-screen.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #26](https://github.com/ELITES-ORG/bilikha/issues/26)

## Goal

Every empty state a registrant or client meets — an empty list, a page that
could not load, the buttons that lead on from them — reads from the catalogue,
so a Filipino or Waray translation reaches it. #26's first pass names "the main
empty states"; sign-in, registration and the legal pages are already
catalogued.

## Scope

**In scope**, in the user-facing pages that still write their empty-state copy
in the component:

| File | Loads | Strings go in |
|---|---|---|
| `pages/DirectoryPage.tsx` | first | `catalogs/en.ts` |
| `pages/OfferDetailPage.tsx` | first | `catalogs/en.ts` |
| `pages/NotificationsPage.tsx` | first | `catalogs/en.ts` |
| `pages/CreativeProfilePage.tsx` | first | `catalogs/en.ts` |
| `pages/MessagesLayout.tsx` | first | `catalogs/en.ts` |
| `pages/HomePage.tsx` | first | `catalogs/en.ts` |
| `features/ratings/components/ProfileRatings.tsx` (via `CreativeProfilePage`) | first | `catalogs/en.ts` |
| `pages/account/*` (four pages) | lazy | new section `catalogs/account/` |
| `pages/MyPostingsPage.tsx` | lazy | new section `catalogs/my-postings/` |
| `pages/ConversationPage.tsx` | lazy | new section `catalogs/conversation/` |
| `features/offers/OfferEditor.tsx` | lazy | the existing `offers` section |

Titles, descriptions and the buttons inside each empty state. "Try again" is one
core key, shared.

**Out of scope** — and where it is handled instead
- The error text under a "Could not load…" title: it is the server's message,
  English until server messages are translated (#26, a decision for reyxdz).
- `SwitchModeAction` and other copy outside empty states — a later pass.
- Admin screens — English, like the rest of the admin area.
- Filipino and Waray values — empty until a speaker writes them (ADR 0055 §4).

## Decisions

- **One reworded string.** A creative's empty services tab said
  "`{firstName}` hasn't added any services." The catalogue has no
  interpolation (ADR 0055 §3), and gluing a name between fragments forces
  English word order, so it reads "No services added yet."
- **A section per lazy page group**, as #76 set: a string costs every visitor
  only if its page loads up front.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. First-load pages | 1 / 1 | Done |
| 2. Lazy pages | 1 / 1 | Done |
| 3. Check and record | 2 / 2 | Done |

---

## Phase 1 — First-load pages

### Step 1.1 — Move their copy into `en.ts`

- [x] **Action.** Each string becomes a key in `catalogs/en.ts`, empty in
  `fil.ts` and `war.ts`, read with `<Message k>`.
- [x] **Verify.** `catalogs.test.ts` key parity passes; the pages render the
  same English.

## Phase 2 — Lazy pages

### Step 2.1 — Their copy in sections

- [x] **Action.** `catalogs/account/`, `catalogs/my-postings/` and
  `catalogs/conversation/`, each registered by its pages and loaded with
  `withSection` in `App.tsx`; the editor's strings join `catalogs/offers/`.
  Each section listed in `catalogs.test.ts` and `section-ownership.test.ts`.
- [x] **Verify.** `section-ownership.test.ts` passes: every key is read only
  where its section loads.

## Phase 3 — Check and record

### Step 3.1 — In the browser

- [x] **Action.** The directory's empty states, a missing offer and an empty
  notifications list at 375px, light and dark, in English and with Waray chosen.
- [x] **Verify.** No raw key on screen; English unchanged; with Waray chosen
  the English fallback is marked `lang="en"`.

### Step 3.2 — The translator guide

- [x] **Action.** `docs/guides/translate-the-interface.md` lists the new
  folders and what is now covered.
- [x] **Verify.** `npm run docs:check` passes.

---

## Acceptance

- [x] No user-facing empty state in the files above writes its English in the
      component.
- [x] Initial JS stays within budget, and grows only by the first-load pages'
      strings.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check`
      pass.

## Follow-ups

- Server error messages (#26) — needs a decision first.
- `SwitchModeAction` and the remaining in-component copy.
