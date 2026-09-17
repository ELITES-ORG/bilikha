# 0026. Dark mode, following the device

- **Status:** Accepted
- **Date:** 2026-09-17
- **Related:** [0010](./0010-theme-static-tokens.md) ·
  [0023](./0023-bottom-navigation-on-phones.md) ·
  [operating constraints §3](../explanation/constraints.md)

## Context

Bilikha is light-only. There is no `prefers-color-scheme` rule and no `dark:`
variant anywhere in the frontend, and `base.css` declares `color-scheme: light`.

That showed up in use: a phone in dark mode opened a `<select>` and got a dark
OS picker over a white page. That particular mismatch is fixed — the listbox is
drawn in-app now — but it was a symptom. Someone whose phone is in dark mode
gets a full-brightness white app, at night, on the budget Android hardware
[constraints §3](../explanation/constraints.md) says the audience is using.

The groundwork is already done. [0010](./0010-theme-static-tokens.md) put every
colour behind a token in `@theme static`, and nothing in the codebase is allowed
to use a raw colour. A second palette is a second set of values for tokens that
already exist, not a re-skin of every component.

## Decision

**Dark mode follows the operating system**, via `prefers-color-scheme`. There is
no in-app toggle.

**Token values are overridden, not duplicated.** The dark palette redefines the
same custom properties under the media query. No `dark:` variants in component
markup — a component that needs one is a component that reached past a token.

**`color-scheme` becomes `light dark`**, in both the meta tag and `:root`, so
scrollbars, text selection, spinners and any remaining native surface follow the
same theme as the page.

**The dark palette is designed, not inverted.** Inverting lightness produces
muddy, over-saturated colour and glaring white text. Surfaces are near-black
rather than black, text is off-white rather than white, and the brand hues are
re-tuned for a dark background.

**Elevation is carried by surface lightness, not shadow.** Shadows are close to
invisible on a dark background; a raised surface gets lighter instead, and
hairlines do the rest.

**Both themes must meet WCAG AA** — 4.5:1 for body text, 3:1 for large text and
interface borders. A palette that fails is not shipped on the grounds that it
looks nice.

## Alternatives considered

**An in-app toggle, stored on the account.** More control, and it would follow
someone between devices. Rejected for now: it is another control to find, more
state to keep, and the OS setting already expresses the preference. The listbox
work has just shown what happens when the app and the device disagree — the fix
is to agree with the device, not to add a third opinion. Worth revisiting if
people ask to override it.

**`dark:` variants per component.** The Tailwind default. Rejected: it puts the
palette back into markup that [0010](./0010-theme-static-tokens.md) deliberately
kept it out of, and every new component becomes a chance to forget.

**Invert the existing palette programmatically.** Cheap. Rejected: it is how
dark modes end up grey and glaring, and the brand colours would not survive it.

**Stay light-only.** Rejected. The audience is on phones, often at night, and a
white screen is both uncomfortable and more expensive in battery on an OLED
panel.

## Consequences

**Good.** Most of the work is already paid for. The custom listbox from the
select work is themed by the same tokens, so it follows automatically, where a
native picker never would.

**Bad.** Every colour decision now has to be made twice, and reviewed twice. A
token that looks right on paper can be unreadable on the other side, and nothing
automated catches that — the contrast check has to be run against both.

**Bad.** User-uploaded images were composed against a light page. A photograph
with a white background sits as a bright rectangle on a dark surface. Nothing
here fixes that, and it is most visible in exactly the place the product cares
about most — the offer cards.

**Bad.** `@theme static` exists because unused tokens get tree-shaken
([0010](./0010-theme-static-tokens.md)). Overriding values under a media query
has to keep that working; a token referenced only from the dark block must still
be emitted.

**Watch for.** Anything that hard-codes a light assumption outside the token
system: `bg-paper/85` in the header, the backdrop blur, image placeholders, and
the toast tones. Those are the places a dark theme will look broken first.
