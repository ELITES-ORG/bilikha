# 0026. Dark mode, following the device

- **Status:** Accepted, amended 2026-09-19 — a theme choice now exists
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

## Amended 2026-09-19: a theme choice, with the device as the default

This record said an in-app toggle was "worth revisiting if people ask to
override it." The registrant asked. So there is one, on the account hub.

**Three choices, not two: System, Light, Dark.** System is the default and stays
reachable, or the control is a one-way door — someone who tries Light can never
get back to following their phone.

**The device still wins until somebody says otherwise.** Nothing is stored until
a choice is made, so a fresh install behaves exactly as this record originally
described.

**The original objection stands and is answered rather than dismissed.** The
worry was a third opinion: the app, the device, and now a stored preference, of
the kind that produced a dark `<select>` on a light page. That bug came from the
app disagreeing with the device *without anyone choosing it*. A preference
somebody set deliberately is not the same failure, and `color-scheme` is set
alongside the palette so native surfaces follow the choice too — which is what
stops the disagreement recurring.

### The palette moves to `light-dark()`

Making the override work turned out to be a reason to fix something else. The
palette was written as four blocks of the same 65 tokens — light in
`@theme static`, dark under the media query, and both again for the style-guide
specimens. 260 declarations, kept in step by hand, which the plan 0014 audit
flagged as a drift risk.

A manual override naively adds a fifth block. Instead each colour token carries
both values in one declaration:

```css
--color-paper: light-dark(oklch(0.988 0.0035 85), oklch(0.18 0.008 60));
```

Lightning CSS resolves this from the computed `color-scheme`, so **setting
`color-scheme` is the whole override** — every token follows at once. The
specimen blocks collapse to a single `color-scheme` line each, and the media
query's colour half disappears entirely.

Verified before deciding, not assumed. A one-token spike showed Lightning CSS
emits both fallback hexes for opacity modifiers — `bg-paper/90` today bakes only
the light value, so `color-mix`-less browsers get a light-tinted header in dark
mode. The move fixes that as a side effect.

**Shadows stay selector-based.** The dark shadows are not merely recoloured;
they add a hairline ring, which is different geometry. Six tokens, overridden
the old way, and that is the honest limit of this approach.

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
