# 0010. `@theme static` for design tokens

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Tailwind 4 defines design tokens in CSS via `@theme`, and by default
**tree-shakes them**: only variables backing a utility class it finds in the
source are emitted to `:root`.

That default is sensible for a typical app and wrong for a design system. It was
caught by building the style guide, which renders colour ramps by reading tokens
directly:

```tsx
<div style={{ backgroundColor: `var(--color-${prefix}-${step})` }} />
```

Every step not otherwise used by a utility class — `--color-clay-950`,
`--radius-xl` — resolved to nothing. The swatches rendered transparent. No build
error, no warning.

Shadows are worse: Tailwind inlines shadow values into `--tw-shadow` inside each
utility and never emits `--shadow-*` at all, so `var(--shadow-lg)` could not
work regardless of usage.

The deeper problem is that dynamic class names cannot be used anyway — Tailwind
only sees complete literals, so `` `bg-${prefix}-${step}` `` generates nothing.
Reading the custom property is the correct pattern, and it requires the property
to exist.

## Decision

Declare tokens with `@theme static`, which emits every token to `:root`
regardless of detected usage.

## Alternatives considered

**Keep the default and hardcode the style guide.** Rejected: the style guide
would then show hand-maintained values rather than the real tokens, which
defeats its purpose — it exists to catch drift, and a hardcoded copy drifts.

**Keep the default and add a `safelist`.** Rejected: a maintained list of every
token, updated by hand on every palette change, that fails silently when
forgotten.

**Define tokens in a plain `:root` block outside `@theme`.** They would all
emit, but Tailwind would generate no utilities from them — losing
`bg-lawa-700`, `text-ink-muted`, and the whole point of theming.

## Consequences

**Good.** Every token is addressable from inline styles, the style guide,
third-party component overrides, and any future canvas or chart code. Tokens
behave as a public API of the design system rather than an implementation detail
of the class scanner.

**Bad.** All tokens ship whether used or not. Measured cost: **+1.24 kB raw,
+0.27 kB gzipped** — 130 variables. Negligible, and it does not grow with page
count.

**Do not remove `static`.** Doing so silently breaks inline `var(--color-…)`
usage with no build error — the failure appears only as unstyled elements at
runtime, which is a genuinely hard bug to trace back to a one-word config
change. This is noted in `frontend/DESIGN.md` for the same reason.
