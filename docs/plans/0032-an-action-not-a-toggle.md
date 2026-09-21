# 0032. An action, not a toggle

- **Status:** Ready
- **Owner:** implementing agent
- **Related:** [ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md)
  (see the 2026-09-22 amendment) · [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md) ·
  [plan 0026](./0026-mode-moves-to-the-account-hub.md)

## Goal

An empty mirrored list still offers a one-tap way out of the wrong mode, but as
a **single action button** — *Switch to Creative mode* — not a segmented control
showing both modes. And a client with no creative profile stops being told to
switch to a mode they cannot enter.

## Why

Plan 0026 moved mode to the account hub and deliberately kept `ModeSwitch` in
empty states, because [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)
requires the way out of a wrongly-emptied list to be on that list. That
requirement stands.

What shipped puts two mode affordances on one screen: the notice at the top
naming the mode, and a two-state control in the empty state offering both.
[ADR 0038](../decisions/0038-mode-is-a-role-you-are-in-not-a-filter.md)'s finding
was that **a two-state control you pick between reads as a filter** — a fact
about the control's shape, not about where on the page it sits. Moving it into
an empty state did not change what it looks like, and the registrant asked why
it was still there.

A button that names what will happen is an action. The notice above already says
which mode you are in, so the control does not need to say it a second time.

## Scope

**In scope**
- A single-action `SwitchModeAction` replacing `ModeSwitch` in
  `ModeAwareEmptyState`.
- Deleting `ModeSwitch`, which this leaves unused.
- Making the empty-state copy profile-aware, not only mode-aware.

**Out of scope**
- The account hub's control. `ModeRow` there is a radio group and is correct —
  that is the deliberate place to *choose* between modes.
- The `ModeNotice` on non-empty lists. It is a sentence and a link, and it stays.
- What mode means, how it is stored, or which surface shows what.

## Prerequisites

- `ModeSwitch` is referenced in four files, but **imported by exactly one**.
  Checked 2026-09-22:

| File | Reference |
|---|---|
| `ModeAwareEmptyState.tsx` | the only import and render |
| `ModeSwitch.tsx` | itself |
| `mode-controls.test.ts` | assertions — see rule 5 |
| `ModeNotice.tsx` | **a comment only**, which goes stale with this change and must be reworded |

  Account uses its own `ModeRow` radio group and does not touch `ModeSwitch`.

- The mode-naming copy sits in ten places: `DirectoryPage` (3), `HistoryPage`
  (5), `MessagesPage` (2). All ten need the profile-aware variant from Phase 2.
- Fixtures: `cre0299739` (creative, has a profile), `adm0403418` (**no creative
  profile** — the account that must never be told to switch). Password
  `verify-pass-2026`, local only.

## Rules for whoever executes this

1. **The way out stays on the list.** One tap, in the empty state, no trip to
   Account. Removing it would reintroduce the trap ADR 0025 named, and that is
   the thing plan 0026 rule 1 was protecting.
2. **One button, naming the destination.** *Switch to Creative mode* when you
   are in client mode, and the reverse. Never both modes shown side by side —
   that is the shape ADR 0038 removed.
3. **Never offer it to an account with no creative profile.** They cannot enter
   creative mode: `effectiveViewMode` forces `hiring` without a profile. The
   button is already hidden for them; the **copy** must stop mentioning it too.
4. **Delete `ModeSwitch` once nothing imports it.** Leaving a component that
   renders the control this decision removed is how it comes back.
5. **`mode-controls.test.ts` will fail, and that is the guard working.** It
   asserts `ModeAwareEmptyState` renders `ModeSwitch`. Update it to assert the
   new action — do not weaken it to nothing. The invariant it protects is *the
   empty state offers a way out*, not *the empty state uses this component*.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The action | 0 / 2 | Not started |
| 2. Copy that knows who is reading | 0 / 2 | Not started |
| 3. Verification | 0 / 3 | Not started |

---

# Phase 1 — The action

### Step 1.1 — `SwitchModeAction`

- [ ] **Action.** A new component in `frontend/src/components/`: a single button
  labelled from the mode you are *not* in — `Switch to ${MODE_LABEL[other]}` —
  writing through the existing `useSetViewMode()`. No new mutation, no new state.
- [ ] **Action.** Renders nothing when `user.profileSlug` is absent, the same
  guard `ModeSwitch` used.
- [ ] **Action.** Use the existing button styling. It is an action in an empty
  state, so it should look like the other actions there rather than like a
  control panel.

### Step 1.2 — Swap and delete

- [ ] **Action.** `ModeAwareEmptyState` renders `SwitchModeAction` instead of
  `ModeSwitch`.
- [ ] **Action.** Delete `frontend/src/components/ModeSwitch.tsx`.
- [ ] **Verify.** `grep -rn "ModeSwitch" frontend/src` returns nothing outside
  the test file you are about to update. Rule 4.

---

# Phase 2 — Copy that knows who is reading

### Step 2.1 — Two variants, not one

- [ ] **Action.** The ten empty-state descriptions naming both modes currently
  read *"You are viewing X. … or switch to Y."* They need a second form for an
  account with no creative profile: what would fill this list, and nothing about
  a mode they cannot enter.
- [ ] **Action.** Put the variant behind the same `profileSlug` signal the button
  uses, so the copy and the control can never disagree — one condition, not two.

### Step 2.2 — Say it once

- [ ] **Verify.** On an empty mirrored list, the mode is named by `ModeNotice`
  at the top and by the empty-state copy, and the button names only the
  destination. If the same fact appears three times, cut it back to the notice
  and the button.

---

# Phase 3 — Verification

### Step 3.1 — The creative

- [ ] **Verify.** As `cre0299739` with an empty mirrored list: one button
  reading *Switch to Creative mode* (or Client), it works in one tap, and the
  list fills or empties accordingly. No segmented control anywhere on the page.

### Step 3.2 — The client with no profile

- [ ] **Verify.** As `adm0403418` on empty Messages and History: no button, and
  **no copy mentioning Creative mode**. This is the defect the plan exists to
  close as much as the toggle is.

### Step 3.3 — Full pass

- [ ] **Verify.** At 375px and desktop. `npm run typecheck`, `lint`, `test`,
  `build`, `docs:check` all exit 0, CI green. `mode-controls.test.ts` asserts the
  new action and still fails when the way out is removed — break it once to
  confirm, then restore.

---

## Acceptance

- An empty mirrored list offers one button naming the mode it will switch to.
- No two-state mode control exists anywhere outside the account hub.
- An account with no creative profile is neither offered nor told about a mode
  it cannot enter.
- `ModeSwitch` is gone and nothing imports it.
- Removing the way out still fails a test.

## Follow-ups

| Item | Why deferred |
|---|---|
| Asking the creatives again | Two rounds of this control have now been changed on their feedback. The cheapest way to know whether it is finally clear is to ask the same people |
| Messages having no mode-aware description | Directory and History change their description with the mode; Messages does not. Noted during plan 0026 and still true |
