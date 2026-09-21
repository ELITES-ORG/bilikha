# 0029. The numbers look like numbers

- **Status:** Ready
- **Owner:** implementing agent
- **Related:** [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)
  (see the 2026-09-22 amendment) · [ADR 0010](../decisions/0010-theme-static-tokens.md) ·
  [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [plan 0027](./0027-how-your-work-is-doing.md) · [plan 0028](./0028-the-money-in-full.md)

## Goal

`/account/work` reads as a dashboard: the headline figures are figures, and the
money across the agreement lifecycle is one horizontal stacked bar. A creative
can scan it. Today it is prose — *"4 agreements · 1 awaiting acceptance · 1 in
progress · 2 completed"* is four numbers in a sentence.

No new data. Everything here already comes back from `GET /me/work`.

## Scope

**In scope**
- A KPI row of stat tiles: agreements, committed, completed, rating.
- One horizontal stacked bar: money by lifecycle state.
- Keeping every zero-state sentence exactly as it is.

**Out of scope**
- **Any new figure.** This is presentation. If you need a field that
  `GET /me/work` does not return, stop — it is a different plan.
- **Time series, sparklines, trends.** Nothing records a history to plot and
  ADR 0039 rejected them on grounds this amendment does not touch.
- **Charting libraries.** One stacked bar is flex children with widths. A
  dependency for this would be larger than the feature
  ([constraint 3](../explanation/constraints.md): budget Android, metered data).

## Prerequisites

- Read the 2026-09-22 amendment on
  [ADR 0039](../decisions/0039-the-creative-dashboard-answers-what-to-do-next.md)
  — it explains what was wrong and what stands.
- `frontend/DESIGN.md`. Tokens only, and **never an interpolated Tailwind class
  name**: a width that varies has to be an inline style or a CSS custom
  property, not `w-[${pct}%]`, which emits no CSS at all.
- Fixtures: `cli0299739` (money in one state), `cre0299739` (cancelled only),
  `nc0850896` (nothing). Password `verify-pass-2026`, local only.

## Rules for whoever executes this

1. **The zero case still wins.** No empty chart frame, no 0% bar, no row of
   ₱0 tiles. When there is nothing, the existing sentence is the whole answer —
   that is the one part of ADR 0039 this plan does not touch.
2. **The bar is sequential, not categorical.** The lifecycle is *ordered*:
   proposed → agreed → in progress → awaiting confirmation → completed. One hue,
   getting darker along the ramp. Never a rainbow of unrelated hues.
3. **Cancelled sits off the ramp**, in `clay`. It is not a stage of progress and
   colouring it as one would say it is.
4. **Never consecutive ramp steps for adjacent segments.** Measured 2026-09-22:
   `lawa-600` and `lawa-700` differ by 0.08 lightness, ΔE 8.1 in *normal*
   vision — indistinguishable side by side. Use steps at least two apart.
5. **Nothing lighter than `lawa-400` as a fill on paper.** `lawa-200` is 1.37:1
   against the page: a segment that light reads as empty track, not as data.
6. **Every segment is directly labelled.** Required, not decorative: it is the
   secondary encoding that makes a single-hue ramp legible to a colourblind
   reader, and the relief for the contrast warning in rule 5.
7. **Both themes are real.** `light-dark()` already inverts the ramp so light
   mode runs light→dark and dark mode dark→light. Check both; do not assume one
   follows from the other.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The figures are figures | 0 / 2 | Not started |
| 2. The money bar | 0 / 3 | Not started |
| 3. Verification | 0 / 4 | Not started |

---

# Phase 1 — The figures are figures

### Step 1.1 — A KPI row

- [ ] **Action.** Above the existing groups, a row of stat tiles: **Agreements**
  (`agreements.total`), **Committed** (`money.committedCentavos`), **Completed**
  (`money.completedCentavos`), **Rating** (`ratings.average`, with `ratings.count`
  beneath).
- [ ] **Action.** The value is the loud part — large, tabular figures, `u-display`
  — with the label small and muted above or below it. A stat tile whose label
  outweighs its number is a sentence with extra steps.
- [ ] **Action.** A tile renders only when it has something to say. No rating
  yet → no rating tile, and its sentence stays in the group below.
- [ ] **Verify.** At 375px the row wraps to two columns and nothing truncates.
  This is the width the complaint came from.

### Step 1.2 — The groups stay

- [ ] **Action.** Keep the existing group sentences beneath the row. They carry
  the things a number cannot: *"1 waiting on your reply"*, *"none saved by
  others yet"*, the payment disclaimer.
- [ ] **Why.** The tiles answer *how much*; the sentences answer *what now*.
  Deleting them to make room would undo plan 0027.

---

# Phase 2 — The money bar

### Step 2.1 — The bar

- [ ] **Action.** One horizontal stacked bar under the money group: each
  lifecycle state with money is a segment, width proportional to its centavos,
  in lifecycle order.
- [ ] **Action.** Steps, all at least two apart on the ramp (rules 4 and 5):

| Segment | Token |
|---|---|
| Proposed | `lawa-400` |
| Agreed | `lawa-600` |
| In progress | `lawa-800` |
| Awaiting confirmation | `lawa-900` |
| Completed | `lawa-950` |
| Cancelled | `clay-400` — off the ramp (rule 3) |

- [ ] **Action.** A 2px surface-coloured gap between segments, and 4px rounded
  outer ends. Adjacent fills of one hue need the gap to read as separate.
- [ ] **Action.** Widths come from an inline style or a custom property. **Not**
  an interpolated Tailwind class — it emits nothing.

### Step 2.2 — Labels and the legend

- [ ] **Action.** Direct-label every segment with its state and amount. With
  five segments a legend is also present (ADR 0039's amendment cites the
  visualization guidance: identity is never colour alone).
- [ ] **Action.** Below ~8% width a segment's label moves outside or to the
  legend rather than being clipped.

### Step 2.3 — It degrades

- [ ] **Action.** One state with money → no bar. A single full-width segment is
  a rectangle, not a comparison; the tile and the sentence already say it.
- [ ] **Action.** Nothing agreed → no bar at all. Rule 1.

---

# Phase 3 — Verification

### Step 3.1 — The three fixtures, both themes

- [ ] **Verify.** `nc0850896`: sentences only, no tiles, no bar.
  `cre0299739`: cancelled only — no bar, and the cancelled figure does not
  masquerade as progress. `cli0299739`: one state — tiles, no bar.
- [ ] **Verify.** Each in light and dark. Screenshot both.

### Step 3.2 — A bar that actually has segments

- [ ] **Verify.** Build a creative holding money in four states — the existing
  factories do this in the `work.test.ts` partition test — and look at the bar.
  Confirm segment widths are proportional to the centavos, and that adjacent
  segments are separable at 375px.

### Step 3.3 — Colour, computed not eyeballed

- [ ] **Verify.** Extract the rendered segment colours and confirm lightness is
  monotonic along the ramp in **both** themes.
- [ ] **Note.** The visualization validator run in *categorical* mode will FAIL
  this palette on lightness band, chroma floor and the normal-vision floor. That
  is expected and not a defect: those checks are for palettes whose job is
  *identity*, and this ramp's job is *magnitude along an order*. Its own scope
  note says so — for a sequential ramp, check lightness monotonicity. Do not
  chase those failures by rainbow-ing the bar.

### Step 3.4 — Full pass

- [ ] **Verify.** `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all
  exit 0, CI green. Grep the diff for an interpolated Tailwind class, for any
  raw colour outside a token, and for a new dependency.

---

## Acceptance

- The headline figures read as figures at a glance, at 375px and on desktop.
- Money across the lifecycle is one ordered, labelled, single-hue bar.
- A creative with nothing still sees sentences and no empty chart.
- Both themes verified, no new dependency, no new data.

## Follow-ups

| Item | Why deferred |
|---|---|
| A count bar beside the money bar | The agreement counts are small integers and the tiles plus the group sentence may be enough. Worth looking at once the money bar is real |
| Sparklines | Needs history nothing records. Same ground as the time-series deferral |
| The same treatment for clients | Clients have postings and agreements received. Mirrored, and not asked for |
