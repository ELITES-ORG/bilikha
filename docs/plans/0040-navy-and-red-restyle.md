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
| 2. Primitives | 0 / 1 | Not started |
| 3. Priority screens | 0 / 1 | Not started |
| 4. Remaining screens | 0 / 1 | Not started |

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
- [x] **Verify.** `grep -rn "fcfbf8\|14110e" frontend/src frontend/index.html frontend/public` finds nothing.

---

## Phase 2 — Primitives

### Step 2.1 — Tabs, Eyebrow, StatItem; button and input sizing

- [ ] **Action.** Awaiting approval of phase 1.

## Phase 3 — Priority screens

### Step 3.1 — Landing, sign-up and login, messages, profile, create-post

- [ ] **Action.** Awaiting approval of phase 2.

## Phase 4 — Remaining screens

### Step 4.1 — Apply the same tokens and components everywhere else

- [ ] **Action.** Awaiting approval of phase 3.

---

## Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [ ] No raw colours or arbitrary brand values in `frontend/src`.
- [ ] Both themes are AA on every screen.

## Follow-ups

Ramp rename; a real favicon.
