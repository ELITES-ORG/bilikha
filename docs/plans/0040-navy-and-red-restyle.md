# 0040. Navy and red restyle

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [ADR 0044](../decisions/0044-navy-and-red-identity.md) ·
  [ADR 0010](../decisions/0010-theme-static-tokens.md) ·
  [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

The app carries the navy and red Bilikha identity: tokens, then the primitives
the design needs, then the screens. Visual only. No change to routes, API calls,
state or component behaviour.

## Scope

**In scope**
- Tokens, fonts and literals (phase 1).
- Tabs, Eyebrow and StatItem primitives; button, input, card and badge shape
  (phase 2).
- Landing, sign-up and login, messages list, profile, create-post (phase 3).
- Remaining screens, for consistency (phase 4).

**Out of scope**
- Renaming the `clay` / `lawa` / `palayok` ramps. A follow-up.
- Replacing `public/favicon.svg`, which is still the default Vite logo.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Tokens, fonts, literals | 3 / 3 | Done |
| 2. Primitives | 1 / 1 | Done |
| 3. Priority screens | 1 / 1 | Done |
| 4. Remaining screens | 1 / 2 | Partial — the admin layout keeps the old header and tabs |

---

## Phase 1 — Tokens, fonts, literals

### Step 1.1 — Retune the colour, radius and shadow tokens

- [x] **Action.** Rebuilt the ramps in `frontend/src/styles/theme.css` and added `--color-primary-soft` and `--color-ring`.
- [x] **Verify.** Every text and fill pair is at least 4.5:1 (3:1 for UI and large text) in both themes.

### Step 1.2 — Swap the fonts

- [x] **Action.** Plus Jakarta Sans replaces Archivo; added `.u-serif`.
- [x] **Verify.** `npm --prefix frontend run build`, then check the Latin woff2 sizes.

### Step 1.3 — Update the literals that mirror paper

- [x] **Action.** `index.html`, `theme-preference.ts`, `manifest.webmanifest`, four `accent-` classes.
- [x] **Verify.** `grep -rn "fcfbf8\|14110e" frontend/src frontend/index.html frontend/public` finds only
  the dark-mode bug note in `theme-preference.ts`, which keeps the old colour on purpose — it describes
  what happened then.

---

## Phase 2 — Primitives

### Step 2.1 — Tabs, Eyebrow, StatItem; button and input sizing

- [x] **Action.** New `Tabs`, `segment-styles`, `Eyebrow`, `StatItem`, `Textarea`;
  `Badge` solid variant; 44px controls; navy-outline secondary; `inverse`
  button; `Wordmark`, `Decor`, `AuthShell` in `frontend/src/components/`.
- [x] **Verify.** `npm run typecheck` and `npm run lint` pass.

## Phase 3 — Priority screens

### Step 3.1 — Landing, sign-up and login, messages, profile, create-post

- [x] **Action.** Landing follows the navy-bar reference variant; auth pages
  share `AuthShell`; messages list, profile banner and create-post card.
- [x] **Verify.** Headless screenshots of `/`, `/login` and `/register` at 390px
  and 1440px, light and dark. Messages and profile need a signed-in session
  and were not captured here; they were checked in review on 2026-10-04 —
  directory, messages, history, account, create-post, notifications, work,
  admin and a creative profile at 375px light and dark and 1280px, plus a
  signed-out visit to `/messages` and a non-admin visit to `/admin`.

## Phase 4 — Remaining screens

### Step 4.1 — Apply the same tokens and components everywhere else

- [x] **Action.** History, Directory and Account toggles use the segmented
  control; page kickers use `Eyebrow`; arbitrary font sizes tokenised.
- [x] **Verify.** `grep -rn "text-\[" frontend/src` finds nothing.

### Step 4.2 — The admin layout

- [ ] **Action.** `AdminLayout` still shows the plain-text "Bilikha" header,
  and the review queue's tabs keep the old underline style. Restyle both to
  match — found in review, left for the next pull request.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [x] No raw colours or arbitrary brand values in `frontend/src`.
- [ ] Both themes are AA on every screen — token pairs verified; every
  screen seen in a browser in review (see Step 3.1), but contrast not measured
  per screen.

## Follow-ups

- ~~Ramp rename (`clay` is slate, `lawa` navy, `palayok` red).~~ Done in
  issue #12: the ramps are now `slate`, `navy` and `red`.
- ~~A real favicon.~~ Done: the navy B, described in plan 0036 under "How the
  icons were made".
- The admin layout (Step 4.2).
- `Tabs` uses `role="tab"` without arrow-key navigation or panel links: add
  both, or render it as `aria-pressed` buttons, as a segmented control.
- Bundle growth from this restyle: initial JS 91.61 → 93.54 kB gzip (+2.1%),
  CSS 13.30 → 16.21 kB gzip (+22%). Issue #10 asks for no growth by the end.
