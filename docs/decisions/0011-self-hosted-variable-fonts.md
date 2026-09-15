# 0011. Self-hosted variable fonts

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

The brief for the visual identity was explicit: professional and modern, but not
generic, and with no trace of a default framework look. Typography carries most
of that. A system-font stack or Inter — the default of nearly every recent
dashboard — would undercut it immediately.

The competing pressure is weight. Most supply-side users are on budget Android
devices over metered data, where every kilobyte on first load is real cost to a
real person.

## Decision

Two self-hosted variable fonts via Fontsource, weight axis only, Latin subset in
practice:

| Face | Build | Latin | Role |
|---|---|---|---|
| **Fraunces** | `opsz.css` (optical size + weight) | ~67 kB | Display only — `.u-display`, never below `text-xl` |
| **Archivo** | `wght.css` (weight) | ~35 kB | All UI and body text |

Roughly 102 kB total, `font-display: swap`.

Fontsource splits by `unicode-range`, so a browser rendering Latin text fetches
only those files and ignores the Cyrillic and Greek subsets.

## Alternatives considered

**System font stack.** Zero bytes. Rejected: no identity whatsoever, and
inconsistent rendering across the Android devices that dominate this audience.

**Google Fonts CDN.** No self-hosting, good cache headers. Rejected: an extra
DNS lookup and TLS handshake to a third-party origin, which is the dominant cost
on high-latency connections — exactly the condition here. It is also a
third-party dependency on the critical render path, and a privacy consideration
for a registry of named individuals.

**Fraunces `wght.css`** — weight axis only, ~37 kB, saving 30 kB. Rejected:
without the `opsz` axis the face renders at a fixed optical size, losing the
stroke contrast and tightened serifs that are the reason to carry a display face
at all. The 30 kB buys the actual benefit.

**Fraunces `full.css`** — adds `SOFT` and `WONK` for extra character, ~121 kB.
Rejected: +54 kB for decorative quirk axes, on connections where that is a
visible delay.

## Consequences

**Good.** A distinctive pairing that reads as editorial and cultural rather than
as a SaaS template. Variable fonts mean one file per family covers every weight.
Self-hosting keeps the render path on one origin. Assets are fingerprinted and
cached indefinitely, so the cost is first-visit only.

**Bad.** ~102 kB on first load, which on a slow rural connection is a real
delay. `font-display: swap` means a visible reflow as Fraunces replaces the
fallback — most noticeable on headings, which is where it is least forgivable.

**If weight becomes a measured problem**, the next move is subsetting to the
exact glyphs used rather than dropping a face. Fraunces appears only in headings,
so its character set is small and a custom subset could plausibly halve it.

**Do not add a third family.** Two is the budget.
