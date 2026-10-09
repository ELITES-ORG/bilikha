# 0044. Navy and red identity, with Plus Jakarta Sans

- **Status:** Accepted. Headings and `.u-display` returned to Fraunces in [0045](./0045-headings-stay-in-fraunces.md).
- **Date:** 2026-10-03
- **Related:** [0010](./0010-theme-static-tokens.md) ·
  [0011](./0011-self-hosted-variable-fonts.md) ·
  [0026](./0026-dark-mode-follows-the-device.md)

## Context

The "Abaca" identity (warm clay neutrals, teal primary, earthenware accent,
Fraunces and Archivo) is replaced by a navy and red identity: a deep navy
primary, a signal-red accent for calls to action and badges, cool slate
neutrals on white, and Plus Jakarta Sans for UI. `frontend/DESIGN.md` had
rejected an indigo-leaning primary and called the accent decorative only; both
statements are superseded here.

Three constraints pushed back on the brief as first written:

- [0011](./0011-self-hosted-variable-fonts.md) caps fonts at two self-hosted
  families for budget Android on metered data, and rejects Inter and a font CDN.
  The brief asked for three families.
- The brief's red, `#E63946`, is 4.17:1 on white. That fails WCAG AA for body
  text and for white button labels.
- Dark mode exists ([0026](./0026-dark-mode-follows-the-device.md)); every
  colour token is a `light-dark()` pair.

## Decision

**Retune the existing ramps in place, keeping their names.** `clay` is now cool
slate, `lawa` is navy, `palayok` is red. Components reference tokens, so every
screen restyles with no markup change. Renaming the ramps is a mechanical
follow-up and was left out to keep this diff reviewable.

**Navy `#032B61`** (OKLCH 0.30 0.105 258) is `lawa-700` and `--color-primary`. It
is sampled from the landing reference images; deeper than the labelled `#123B6D`.

**Red has two roles.** `palayok-500` (`#E63946`) is for decoration and large
text only (3:1 applies). `--color-accent-solid` (`#DB2334`, 4.8:1 with white)
carries button labels and badge fills. The brief's exact red is kept where it
passes.

**Status red moves away from brand red.** `danger` is a deeper, browner brick
(hue 30 against the brand's 22) so an error is not read as a call to action.
Status is still never colour alone.

**Plus Jakarta Sans replaces Archivo.** Fraunces stays, for the landing hero
only (`.u-serif`). Two families, so the 0011 budget and its "do not add a third
family" rule stand. Inter and Google Fonts are not used.

**Dark mode is re-tuned, not dropped.** Each token got a designed dark value.
Every text and fill pair was checked at 4.5:1 (3:1 for UI and large text) in both
themes.

**New tokens only where no name existed:** `--color-primary-soft` and
`--color-ring`. Border, muted and hover colours reuse `hairline`, `ink-muted` and
`accent-solid-hover`.

## Alternatives considered

**Add Inter for body, as briefed.** Rejected: a third family, roughly 45–50 kB
more on first load, against 0011.

**Use `#E63946` for filled buttons.** Rejected: white on it is 4.17:1. Darkening
the fill one step costs little and passes.

**Rename the ramps to `slate` / `navy` / `red` now.** Deferred: it touches
hundreds of call sites for no visual change.

**Drop dark mode while restyling.** Rejected: the Light/Dark/System setting
exists and would regress to the old teal palette.

## Consequences

**Good.** One token file restyles the whole app. Both themes stay AA.

**Bad.** The ramp names no longer describe their colours (`clay` is slate,
`lawa` is navy) until the rename happens. `danger` and the accent are
neighbours on the hue wheel, separated by lightness and chroma rather than hue,
so they lean on the icon-or-label rule more than before. Plus Jakarta Sans sets
slightly wider than Archivo, so some tight layouts may wrap earlier.

## Amendment — 2026-10-08: the ramps are renamed

The rename this record deferred has happened (issue #12): `clay` is now
`slate`, `lawa` is `navy` and `palayok` is `red`, in `theme.css`, every class
in `frontend/src`, `DESIGN.md` and the style guide. The values did not change;
the built CSS defines the same 301 tokens with the same values. The new names
replace Tailwind's own `slate` and `red` ramps, which the app never used.
Earlier plans and records keep the old names as history.
