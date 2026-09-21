# 0023. A filter rail for the directory

- **Status:** Reverted — built, reviewed, and undone at the registrant's call
- **Related:** [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md) ·
  [ADR 0023](../decisions/0023-bottom-navigation-on-phones.md) ·
  [ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)

---

> **Reverted on 2026-09-19.** The rail was built and then undone: the registrant
> wants the listings to dominate the directory with the filters collapsible, as
> they were. `89025ee`, `9980f2c` and `00caa80` are reverted and `DirectoryPage`
> is byte-identical to what preceded them. Kept for the reasoning in
> [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md),
> not as work to pick up.

## Goal

On wide screens the directory's filters stand in a rail beside the results
instead of behind an icon, and the results column narrows to a readable measure
rather than stretching across an empty row. Phones keep exactly what they have.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Eight specific to this plan:

1. **One set of filter state, two presentations.** The rail and the phone panel
   read and write the same state through the same `setFilter`. If you find
   yourself duplicating a handler, stop — that divergence is the thing
   [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md)
   names as the warning sign.
2. **Extract the fields; do not rewrite them.** The Selects, the budget inputs
   and their behaviour move into one component used by both. Same props, same
   `onValueChange`, same clearing rules.
3. **Phones change in no way at all.** Same toggle, same panel, same Escape and
   click-outside handling, same active-filter badge.
4. **No grid.** Results stay a single-column list.
   [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md) —
   a grid advertises how thin the registry is.
5. **Nothing but filters goes in the rail.** No saved searches, no map, no
   promoted creatives.
6. **The rail holds all three modes.** The directory is Offers, Creatives and —
   in *I'm for hire* — Postings ([ADR 0025](../decisions/0025-client-postings-and-mirrored-home.md)).
   Each shows the filters that apply to it, the way the panel already does.
7. **Tests ship with it**, for whatever is pure logic. Layout is not, and that is
   fine; do not invent render tests to look thorough.
8. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- A `DirectoryFilters` component holding the fields, used by the rail and the panel
- A rail beside the results at `lg` and up
- The results column narrowed to a readable measure
- The active-filter count and Clear all, in both presentations
- Keyboard and screen-reader behaviour for the rail

**Out of scope** — do not build these
- A results grid. Rule 4
- Moving the product navigation anywhere. ADR 0036
- New filters, or changes to what any existing filter does
- Saved searches, sorting controls, a map. Rule 5
- Anything on the offer index or postings feed outside `/directory`
- Changing the phone experience. Rule 3

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. Extract the fields | 2 / 2 | Reverted with the plan |
| 2. The rail | 3 / 3 | Reverted with the plan |
| 3. The results column | 1 / 1 | Reverted with the plan |
| 4. Verification | 2 / 4 | Partial — automated + CI green; interactive left open |

---

# Phase 1 — Extract the fields

### Step 1.1 — One filter component

- [x] **Action.** Move the fields out of `DirectoryPage`'s panel into
  `frontend/src/features/directory/DirectoryFilters.tsx`: domain, sub-domain
  (disabled until a domain is chosen), municipality, and the budget pair where
  the mode shows it.
- [x] **Action.** It takes the current values and the callbacks it already uses.
  It owns no state of its own — rule 1.
- [ ] **Verify.** The panel renders it and behaves exactly as before: same
  clearing of sub-domain when the domain changes, same budget handling, same
  disabled states.

### Step 1.2 — Prove the move

- [x] **Verify.** `git diff` on `DirectoryPage` for this step shows the fields
  leaving and the component arriving, and no change to `setFilter`,
  `clearFilters`, `applyBudget` or `activeFilterCount`. Rule 2.

---

# Phase 2 — The rail

### Step 2.1 — The layout

- [x] **Action.** At `lg` and up, the results area becomes two columns: a rail of
  about `w-64` and the results beside it. Below `lg`, nothing changes — the rail
  is hidden and the toggle is shown.
- [x] **Action.** The rail is `<aside>` with an accessible name, sticky below the
  site header so it stays with the reader on a long list.
- [x] **Note.** The toggle button and its badge hide at `lg` and up. Two ways to
  reach the same filters on one screen is a bug, not redundancy.

### Step 2.2 — What the rail shows

- [x] **Action.** A heading, the active-filter count, Clear all when anything is
  set, and `DirectoryFilters`.
- [x] **Action.** Whichever fields the current mode and view apply, exactly as
  the panel decides today. Rule 6 — check *I'm for hire* as well as *I'm hiring*.

### Step 2.3 — Keyboard and reading order

- [x] **Action.** The rail sits before the results in the DOM, so tab order runs
  filters then results.
- [x] **Verify.** No focus trap, no Escape handler, no open/closed state on the
  rail. It is always there; only the panel below `lg` has state.

---

# Phase 3 — The results column

### Step 3.1 — A readable measure

- [x] **Action.** With the rail taking its width, constrain the results column so
  a row's content does not stretch across the full container. The list keeps its
  `divide-y` shape.
- [ ] **Verify.** At 1280px and 1920px a result row reads as a row, not as a
  line of text with an empty half beside it. This is the thing that prompted the
  plan — if it still looks empty, the measure is wrong.

---

# Phase 4 — Verification

### Step 4.1 — Phones are untouched

- [ ] **Verify.** At 346px and 375px: the toggle, the panel, Escape,
  click-outside and the badge all behave as before, and no rail is rendered.
  Rule 3.

### Step 4.2 — One state, two presentations

- [ ] **Verify.** Set a filter in the rail, narrow the window below `lg`, open
  the panel: the same filter is set. Widen again: still set. The URL carries it
  throughout.

### Step 4.3 — All three modes

- [ ] **Verify.** Offers and Creatives in *I'm hiring*, and Postings in *I'm for
  hire*: the rail shows the right fields for each, and switching view or mode
  does not strand a filter that no longer applies.

### Step 4.4 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0, and
  CI green on the pushed commit. Confirm no `dark:` class was added and no
  invented Tailwind token — both fail silently.

---

## Acceptance

- At `lg` and up the filters are visible without a tap, and the toggle is gone.
- Below `lg` nothing changed.
- One filter component, one set of state, one `setFilter`.
- A result row no longer reads as half-empty on a laptop.
- Results are still a single-column list.
- The rail holds filters and nothing else.

---

## Follow-ups

Not in this plan:

- The offer index and postings feed outside `/directory`, if they end up wanting
  the same treatment.
- Sorting controls, which would be a second thing competing for the rail and are
  the pressure [ADR 0036](../decisions/0036-persistent-chrome-holds-the-most-used-control.md)
  says to watch for.
- Whether the empty-state copy should change when filters are set from a rail
  the reader can see, rather than a panel they opened.
