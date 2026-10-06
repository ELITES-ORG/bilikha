# 0043. The account hub redesign

- **Status:** In progress
- **Owner:** emanuel
- **Related:** [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [plan 0042](./0042-the-creative-profile-page.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Goal

`/account` reads as the person's home in Bilikha rather than a settings list:
who they are, what they have going on, and their settings — wider, with a
profile summary and two cards. ADR 0027 still holds: the hub links to its
editors and edits nothing but the theme and mode choices.

## Scope

**In scope**
- A profile summary (avatar, name, username, crafts, town, bio, review
  status) with View profile when published, Edit profile otherwise.
- "Your activity" and "Settings" as two cards, side by side from `md`.
- A "Saved offers" row to the existing `/history?segment=saved`, on the
  hiring side only — the rule History already applies.
- The "Offer your creative work" call to action, restyled.
- The install row's markup, to match the other settings rows.

**Out of scope** — no data or page exists for these
- Cover photo, verified badge, posts, followers, following, Help.
- Message and Follow — they make no sense on your own account.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Page | 1 / 1 | Done |
| 2. Install row | 1 / 1 | Done |
| 3. Browser check | 0 / 1 | Not started — needs a signed-in session |

---

## Phase 1 — Page

### Step 1.1 — Rebuild `pages/account/AccountPage.tsx`

- [x] **Action.** Same queries and routes; craft names resolve through the
  cached taxonomy, since the own profile carries slugs only.
- [x] **Verify.** `npm run typecheck` and `npm run lint` pass.

## Phase 2 — Install row

### Step 2.1 — Restyle `components/InstallGuide.tsx`

- [x] **Action.** Markup only: icon, text, the button beside it from `sm`.
- [x] **Verify.** `git diff -w` shows no change to its hooks or handlers.

## Phase 3 — Browser check

### Step 3.1 — Look at it signed in

- [ ] **Action.** A creative account and an account without a profile, at
  360–1920px, light and dark.
- [ ] **Verify.** One column under `md`, two from it; no horizontal scroll;
  every row link, Appearance, Mode, Install and Security still work.

---

## Acceptance

- [x] `npm run typecheck`, `npm run lint`, `npm run docs:check` pass.
- [ ] Checked signed in, at every listed width, in both themes.

## Follow-ups

None.
