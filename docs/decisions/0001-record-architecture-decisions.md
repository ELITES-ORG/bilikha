# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Bilikha's early decisions were made in conversation, with reasoning that exists
nowhere in the repository. Several of them look wrong without the context of a
180,000-person province — no PostGIS, no external search, a restrained review
system, an unresolved SEO gap accepted on purpose.

Without a record, the predictable outcome is someone six months from now asking
"why didn't we just use Next.js?" and either re-deciding from scratch or, worse,
quietly reversing a deliberate choice because it looked like an oversight.

## Decision

Keep lightweight architecture decision records in `docs/decisions/`, numbered
sequentially, following the template in `_template.md`.

Write one when a choice would be expensive to reverse, when a reasonable
alternative was rejected, or when the decision will look wrong without context.
Not for choices with an obvious default.

## Alternatives considered

**Nothing.** The status quo. Cheapest, and the reason the reasoning is currently
only in a chat log.

**A single ARCHITECTURE.md.** One growing document mixes settled decisions with
current-state description, and gives no way to mark something superseded while
keeping its reasoning.

**Wiki or external tool.** Drifts from the code, needs separate access, and does
not appear in code review.

## Consequences

Decisions get reviewed as part of a PR, in the same diff as the code that
implements them.

Records are immutable once accepted — a changed mind means a new record marking
the old one superseded, never an edit. That is deliberate: the history of
reasoning is the value.

Cost is a few minutes per decision, and the discipline to actually write one at
the moment of deciding rather than later, when the reasoning has already faded.
