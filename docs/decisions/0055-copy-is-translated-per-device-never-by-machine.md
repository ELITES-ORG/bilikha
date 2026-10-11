# 0055. Language is a per-device choice, catalogues load on demand, and no string ships machine-translated

- **Status:** Accepted, amended 2026-10-11 — a lazy route's English loads with the route
- **Date:** 2026-10-08
- **Related:** [0026](./0026-dark-mode-follows-the-device.md) ·
  [0010](./0010-theme-static-tokens.md) ·
  [0031](./0031-testing-strategy.md) ·
  [operating constraints §3, §5, §7](../explanation/constraints.md) ·
  [issue #26](https://github.com/ELITES-ORG/bilikha/issues/26) ·
  [issue #74](https://github.com/ELITES-ORG/bilikha/issues/74)

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

*Amended 2026-10-11 (below): English is bundled for screens in the first-load
bundle only. A lazy route's English loads with the route.*

### 3. No translation library

A `t(key)` over a plain object and a context provider is about sixty lines.
`react-i18next` and its peers are 15–40 KB for plural rules, interpolation
grammar, namespaces and a backend plugin chain, none of which this needs yet.
Adding one later is a contained change; shipping it now against four hard-coded
strings is not.

### 4. **No string ships machine-translated**

Every catalogue entry is written or reviewed by a fluent speaker. A key with no
human translation falls back to English, visibly and on purpose.

The document's `<html lang>` records the chosen language. The application root
remains `lang="en"` because most existing copy is still English, and every
catalogue message declares the language of the value it actually renders. A
real Filipino or Waray value therefore overrides the English ancestor, while
an empty entry keeps the English voice. This preserves the device choice
without asking assistive technology to pronounce fallback English as another
language.

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

## Amendment — 2026-10-11: a lazy route's English loads with the route

§2 assumed English costs nothing to bundle because it moves bytes out of
components. That holds for a screen in the first-load bundle and stops holding
for a lazy route. When the privacy notice and the terms moved into `en.ts`,
about 130 strings that used to load only with `/privacy` and `/terms` started
loading on every first visit, and first-load JavaScript rose from about 173 kB
to 177.5 kB gzip ([issue #74](https://github.com/ELITES-ORG/bilikha/issues/74)).
Nobody pays that once and moves on: constraint 3 applies to every first visit.

**The rule now.** `catalogs/en.ts` holds the English for screens in the
first-load bundle. A lazy route's English is a **section**: its own folder under
`catalogs/`, with `en.ts`, `fil.ts` and `war.ts` beside each other, and an
`index.ts` that registers it. The route imports that `index.ts`, so the
English ships in the route's chunk. The legal pages are the first section
(`catalogs/legal/`, imported by `pages/legal/LegalLayout.tsx`).

**How it loads.**

- Registration happens at module scope, when the route's chunk is evaluated and
  before its first render. The English is in place for that render, so there is
  no frame of missing text and no loading state.
- After registration a section's English is part of the fallback.
  `translate` and `resolveMessage` behave exactly as before: an empty or
  missing value falls back to English, marked `lang="en"`.
- When a language other than English is chosen, that language's file is
  fetched for every registered section, including one that registers later,
  such as opening `/privacy` with Waray already chosen. Section translations
  are held in `sections.ts`, not the provider's state, and are read when a
  string is asked for, so a translation is usable the moment its file arrives.
- **The route waits for its translation.** The legal routes' `lazy()` imports
  go through `withSection('legal')`, which holds the route behind its loading
  state until the chosen language's file has arrived. A Waray reader sees the
  page once, in Waray, never in English first and then changing language
  under them. For a consent document that matters more than the wait, which is
  one small file. English readers wait for nothing. If the file fails, or takes
  longer than three seconds, the page renders in English, and the translation
  replaces it if it arrives later.
- `MessageKey` is still one type for every key. `en.ts` names the section's
  keys through a type-only import, which compiles to nothing.

**The guard.** `catalogs.test.ts` checks key parity separately for each set,
the core catalogue and each section. It also checks that no key appears in two
sets, so every key has exactly one English. A key read where its section is not
loaded would render as itself ("privacy.title"), so
`section-ownership.test.ts` names the one folder that loads each section and
fails if a section's key is read anywhere else, or if that folder stops
importing the section. `legal-pages.test.ts` renders both legal pages and
fails if any key reaches the screen.

**Rejected: an async `t()` that fetches a missing key on demand.** It turns
every string into a loading state, and a page of legal text that fills in
paragraph by paragraph is worse than one that arrives once, complete. **Rejected: one
catalogue split automatically by the bundler.** Translators would lose the
property that a screen's strings, in every language, sit in one visible place.

**For translators**, nothing changes but where to look. A section's files sit
in their own folder and follow the same rules, including §4.
[Translate the interface](../guides/translate-the-interface.md) lists them.
