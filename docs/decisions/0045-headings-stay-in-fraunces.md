# 0045. Set headings in Fraunces; keep Plus Jakarta Sans for UI and body

- **Status:** Accepted
- **Date:** 2026-10-04
- **Related:** [0011](./0011-self-hosted-variable-fonts.md) ·
  [0044](./0044-navy-and-red-identity.md)

## Context

[0044](./0044-navy-and-red-identity.md) moved every heading, the wordmark and
`.u-display` from Fraunces to Plus Jakarta Sans, leaving Fraunces only on the
landing hero and the sign-in headlines. Seen side by side on staging and
production, the serif headings of the earlier "Abaca" identity were the part
worth keeping: they carry the brand's character, and Plus Jakarta Sans reads
better than Archivo at body and UI sizes.

## Decision

**Fraunces carries headings and display type; Plus Jakarta Sans carries UI and
reading text.** `--font-heading` points at `--font-serif`. `h1`–`h6` return to
weight 600, and `.u-display` returns to Fraunces at weight 600 with its
optical-size axis raised (`'opsz' 48`), as it was before 0044. The wordmark sets
"Bilikha" in the same face; the red spark and navy colour from 0044 stay.

Everything else in 0044 stands: the navy and red palette, the dark-mode tuning,
and Plus Jakarta Sans replacing Archivo. Still two families, so the 0011 budget
holds and no font is added to the bundle — `@fontsource-variable/fraunces/opsz.css`
was already loaded.

## Alternatives considered

**Keep 0044 as shipped (all sans).** Rejected: it lost the serif headings the
brand is recognised by.

**Revert the whole identity to Abaca.** Rejected: only the headings were in
question; the new palette and body face are kept.

**Restore the "BILIRAN" label beside the wordmark.** Not done here; the wordmark
change is the face only.

## Consequences

**Good.** One token (`--font-heading`) and one utility (`.u-display`) restyle
every heading. No extra download.

**Bad.** Fraunces now arrives on every page with a heading, not only the landing
page, so the `font-display: swap` reflow 0011 describes is back on headings.
Small headings (`text-sm`/`text-base` `h2`/`h3`) render in the serif, as they
did before 0044. `.u-serif` and `.u-display` now render identically; they stay
separate so the hero keeps its serif if headings change again.
