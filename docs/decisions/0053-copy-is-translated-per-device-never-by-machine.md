# 0053. Language is a per-device choice, catalogues load on demand, and no string ships machine-translated

- **Status:** Proposed
- **Date:** 2026-10-08
- **Related:** [0026](./0026-dark-mode-follows-the-device.md) ·
  [0010](./0010-theme-static-tokens.md) ·
  [0031](./0031-testing-strategy.md) ·
  [operating constraints §3, §5, §7](../explanation/constraints.md) ·
  [issue #26](https://github.com/ELITES-ORG/bilikha/issues/26)

## Context

Bilikha is English-only. Biliran is Waray-speaking, with Cebuano and Tagalog
also in use, so English-only copy excludes exactly the registrants who are
hardest to reach — constraint 5 says so, and it is load-bearing rather than
aspirational.

Two things make this more than a convenience feature:

1. **The privacy notice and terms are consented to.** RA 10173 requires
   demonstrable, informed consent (constraint 7). Consent to a document
   somebody could not read is not informed, and the schema already records
   `privacy_consent_at` and `consent_version` as if it were.
2. **The audience is on metered data** (constraint 3). A translation system
   that makes every visitor download every language is the kind of
   general-web-instinct fix this codebase exists to avoid.

Three decisions in issue #26 are reyxdz's and are not settled: which languages
come first, who translates and reviews, and what the first pass covers. None of
them blocks the mechanism, and all of them block the words.

## Decision

### 1. Language is a per-device choice, stored like the theme

A `bilikha-locale` key in `localStorage`, read and written through
`frontend/src/lib/locale.ts`, which mirrors `theme-preference.ts` deliberately
— same shape, same try/catch around blocked storage, same "nothing stored means
the default" rule. English stores nothing.

It is per device and not on the user, for the same reason the theme is: a
shared phone in a barangay hall is a different reader each time, and signing in
is not what changes which language someone reads.

### 2. English is bundled; every other catalogue is fetched on demand

`en.ts` ships in the main bundle because it *is* the interface text — extracting
it from components moves those bytes rather than adding them. Every other
catalogue is a dynamic `import()`, so an English-only visitor downloads nothing
extra and the first-load budget does not move.

The cost is a frame of English before a chosen catalogue arrives on a cold
load. Accepted: it is one frame, against making everyone pay for languages they
do not read.

### 3. No translation library

A `t(key)` over a plain object and a context provider is about sixty lines.
`react-i18next` and its peers are 15–40 KB for plural rules, interpolation
grammar, namespaces and a backend plugin chain, none of which this needs yet.
Adding one later is a contained change; shipping it now against four hard-coded
strings is not.

### 4. **No string ships machine-translated**

Every catalogue entry is written or reviewed by a fluent speaker. A key with no
human translation falls back to English, visibly and on purpose.

This is the part of this ADR that is a rule rather than a technique. Machine
output in Waray reads as plausible to a non-speaker and wrong to a speaker,
which is the worst combination for a registry whose whole problem is
trust in a small province — and for a consent document it is a legal defect,
not a copy defect. A missing translation is honest and obvious; a fabricated
one is neither.

Practically: `fil` and `war` catalogues are committed with their keys present
and their values empty, and the runtime falls back to English for an empty
value. A translator fills them in without touching a component.

### 5. Longer text is a layout requirement, not a translator's problem

Filipino and Waray run longer than English for the same sentence. Layouts
absorb it: no fixed widths on text containers, no single-line truncation on
anything load-bearing, checked at 360px. This is the existing redesign rule,
restated here because translation is what will break it.

## Alternatives considered

**Store the language on the user.** Follows them across devices and is what a
larger product does. Rejected for now: it needs an account, so a signed-out
visitor — which is everyone on their first visit, and the whole audience this
feature exists for — gets nothing. Revisit as a sync *on top of* the device
choice, never instead of it.

**Negotiate from `Accept-Language`.** Free and automatic, and wrong here: a
budget Android sold in Biliran reports `en-PH` or `en-US` almost regardless of
what its owner reads, so it would detect English for exactly the people who
need Waray. Worth offering as a first-visit hint later; not as the mechanism.

**Machine-translate now, have a speaker review later.** Tempting, and the
reason this ADR has a rule in it. Review of generated text is much weaker than
authorship: a reviewer reads for errors and nods past fluent nonsense, and
nobody re-reads a page that already looks finished. For the privacy notice it
would also mean publishing a consent document nobody competent has read.

**Ship all catalogues in the main bundle.** Simpler, no loading state, and it
charges every visitor for languages they will never select. Constraint 3.

**A translation library.** See above. Revisit when plurals or
interpolation-heavy copy actually appear.

## Consequences

**Easier.** A translator works in one file per language and never opens a
component. Adding a language is a catalogue plus one entry in the locale list.
A missing string degrades to English rather than to a blank.

**Harder.** Every new piece of user-facing copy now has two homes — the key and
the English value — and the failure mode is a developer hard-coding a string
back into a component, where no translator will ever find it. Nothing
automated catches that yet; a lint rule for literal text in JSX is the obvious
follow-up and is not built.

**Mixed-language screens are now possible**, and will happen: a translated
sign-in form above an untranslated error message from the API. Server-side
copy is not covered by this ADR at all — the API answers in English, and
`AppError` messages reach the user. That is a real gap, named here so it is not
mistaken for an oversight.

**Cost.** A locale module, a sixty-line runtime, one catalogue per language, a
control in the account hub, and `<html lang>` kept in step. The expensive part
is not the code; it is finding the speakers, which is why the words are
deliberately not in this change.
