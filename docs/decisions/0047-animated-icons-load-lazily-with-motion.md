# 0047. Animated icons use motion, loaded lazily behind their static icon

- **Status:** Proposed
- **Date:** 2026-10-07
- **Related:** [constraints](../explanation/constraints.md) (3: budget Android
  over metered data) · [frontend/DESIGN.md](../../frontend/DESIGN.md) (Motion)

## Context

The landing page read as flat. The three "at a glance" figures on the hero
(domains, crafts, towns) were the first place to fix it, with icons that keep
moving. A CSS loop over the whole icon — rocking, floating, hopping — was tried
first and looked cheap: the icon moved as one rigid shape. Icons that look
animated move their parts: a palette's outline draws and its paint dots spring
in; a pin lifts and its centre redraws.

That kind of per-part animation of an SVG, with springs and staggered children,
is what an animation library is for. Bilikha had none. The audience is on
budget Android over metered data, so every byte of the first page load is paid
for by the reader, whatever ceiling `frontend/bundle-budget.json` allows.

## Decision

**Animated icons come from lucide-animated, adapted into
`frontend/src/components/animated-icons/`, and run on `motion`. They are only
ever loaded with `lazy()`, behind a Suspense fallback of the matching static
Lucide icon at the same size.**

- The chunk uses `LazyMotion` with `domAnimation` and `m.*` elements, `strict`
  so a stray `motion.*` cannot pull the full feature set back in. Measured at
  27.5 kB gzip, against 41 kB with the full `motion` component.
- Icons loop only while on screen and the tab is visible, take turns rather
  than move together, play at once on hover or tap of the stat they sit in, and
  never play under reduced motion.
- lucide-animated is MIT; its licence is kept beside the icons.

## Alternatives considered

**CSS keyframes on the whole icon.** No dependency and almost no bytes. Tried
and rejected on how it looked: the icon moves as a single piece.

**Hand-written CSS for each part of each icon.** Possible without a library,
but springs, staggered children and path drawing have to be rebuilt by hand per
icon, and the result is code nobody else maintains.

**Lordicon, or Flaticon's animated icons (Lottie).** The richest look, but the
Lottie player is larger than this chunk, the free licences need a visible
credit link, downloads need an account, and Flaticon's colours are baked in
and do not follow the dark theme.

**`motion` in the main bundle.** Simplest to write, and it would add tens of
kilobytes to every first page load for a decoration.

## Consequences

**Good.** Icons that read as animated, in the same Lucide style as every other
icon here, following `currentColor` in both themes. The first page load does
not carry `motion`: a phone downloads the 27.5 kB chunk once, after the page is
usable, and sees the static icon until then.

**Bad.** A new runtime dependency, and a second way to animate besides
`motion.css`. Keep `motion` to decorative work that CSS cannot do well; anything
CSS can do stays in `motion.css`. Sharing React with a lazy chunk split React's
runtime into its own modulepreloaded file, which costs about 0.7 kB gzip on the
first load from chunk overhead alone. Each new animated icon must be adapted by
hand from the upstream source.
