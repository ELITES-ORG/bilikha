# 0048. One radius for every box

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related:** [0010](./0010-theme-static-tokens.md) ·
  [0044](./0044-navy-and-red-identity.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

## Context

Radius was graded by element size: 6px chips, 12px buttons and inputs, 16px
cards, 20px panels, with pills (`rounded-full`) for the landing page's
municipality chips, badges, the corner actions and every icon button. The
reasoning was that uniform rounding flattens hierarchy. In practice the owner
found it read as inconsistent: a pill chip beside a 12px button beside a 16px
card, with corners that looked soft and bubbly on a phone screen. The owner
asked for one fixed corner on every container and button, at about 5%.

## Decision

**Every box gets the same 8px corner** — chips, badges, buttons, icon buttons,
inputs, cards, panels, dialogs. A percentage was rejected for the value: a
percentage radius is measured against each side separately, so a wide button
gets oval corners and every size gets a different curve, which is the
inconsistency being removed. 8px is roughly what 5% comes to on a chip-sized
box, fixed.

`--radius` in `theme.css` holds the value and `--radius-xs` … `--radius-2xl`
all point at it, so the hundred-odd existing `rounded-sm` / `rounded-md` call
sites follow without being rewritten, and changing the corner later is one line.

**`rounded-full` is kept only for what is round by nature**: avatars, status
dots, spinners, the map's pins, the bloom transition. Anything a person presses
or reads inside is a box.

The chat bubble keeps one square corner on the sender's side as its tail; that
corner is a shape, not a different radius.

## Alternatives considered

**Keep the graded scale.** Rejected by the owner: the hierarchy argument did
not survive seeing the pills and 16–20px corners side by side.

**A percentage, as first suggested.** Rejected for the reason above.

**Rewrite every call site to a single `rounded-box` class.** Cleaner names, but
a large mechanical diff across the app for no visual difference; the scale's
names resolving to one value gets the same result.

## Consequences

**Good.** One corner everywhere; a single token to tune.

**Bad.** `rounded-sm` and `rounded-lg` now mean the same thing, which is
misleading to anyone reading a class list without this record. DESIGN.md says so.

**Bad.** Nested boxes — a card inside a panel — share a radius rather than the
inner one being smaller, so the gap between their corners is uneven by a few
pixels. Not visible at 8px.
