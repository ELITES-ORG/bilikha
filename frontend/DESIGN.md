# Bilikha — design system

Run the app and open `/styleguide` to see every token and primitive rendered.
This file covers the rules that a specimen page cannot show: when to use what,
and what not to do.

---

## Where things live

| File | Holds |
|---|---|
| `src/styles/theme.css` | Every token. Colour, type scale, radius, elevation, easing, layout rhythm. |
| `src/styles/base.css` | Element defaults, focus treatment, `.u-*` helpers. |
| `src/styles/motion.css` | Keyframes, interaction classes, reduced-motion handling. |
| `src/components/ui/` | Primitives. Import from `@/components/ui`. |

`@theme static` is deliberate — it emits all tokens to `:root` instead of only
those Tailwind sees in a class name, so `var(--color-clay-950)` works from
inline styles and the style guide. Dropping `static` silently breaks those.

---

## Identity

**Type.** Fraunces for display, Archivo for everything else. Fraunces is loaded
with its optical-size axis and applied through `.u-display` — never to body
copy, and never below `text-xl`. Archivo carries all UI and reading text.

**Palette — "Abaca".** Neutrals are warm clay rather than blue-grey, so screens
read as paper. `lawa` (deep marine teal) is the primary; `palayok` (fired
earthenware) is the single decorative accent.

**Why not the obvious defaults.** Saturated indigo primaries, neutral-black
shadows, and one radius applied to everything are what a framework gives you
before anyone has made a decision. Each is replaced here on purpose.

---

## Rules

**Colour**

- `palayok` is decorative only — domain markers, active indicators, rules. It is
  never a status colour.
- Status is never colour alone. Pair every status badge with an icon or a word.
- Text on paper uses steps 600–700. Steps 400 and below fail contrast at body
  sizes.

**Type**

- Size is always an explicit decision. Headings inherit the display face but no
  size, so nothing gets styled by accident.
- The scale carries its own line-height and tracking. Don't override them —
  tracking tightens as size grows, and that tuning is most of what separates set
  type from default type.
- `text-base` (15px) is UI; `text-md` (16px) is reading copy. Don't mix them in
  one block.

**Space**

- Page gutters come from `--gutter` via `<Container>`, never per-page padding
  classes. Section rhythm comes from `--section-gap`. Both step up at `md` and
  `xl`.

**Radius and elevation**

- Radius is graded: `xs` chips, `sm` buttons and inputs, `md` cards, `lg` panels
  and modals. Uniform rounding flattens hierarchy.
- Prefer a hairline to a shadow. Stop at `shadow-lg` for anything in-page;
  `xl` is for overlays only.
- Shadows are ink-tinted. Never introduce a neutral-black one — it greys out
  over warm paper and reads cheap.

**Motion**

- 90–200ms for anything the user triggers. 300ms+ only for entrances of large
  surfaces. Slow UI animation reads as lag, not polish.
- Transform and opacity only. Animating width, height, top, or left forces
  layout every frame and stutters on the budget Android hardware most of this
  audience uses.
- Hover lift (`interactive-lift`) belongs only on cards that are themselves
  links. Buttons use `interactive-press`.
- List entrances stagger via `style={{ '--i': index }}`, capped at 360ms so the
  last row never waits.
- Everything collapses under `prefers-reduced-motion`: movement is removed,
  opacity survives so state stays legible.

**Accessibility**

- One focus treatment, defined once in `base.css`. Don't add per-component focus
  rings.
- Empty states are a normal condition here, not an error — a province this size
  will have sub-domains with no registrants for a long time. Use `<EmptyState>`
  with a way forward, never a bare "no results".
- No heading may imply a visibility that is untrue of the fields under it.
  Group by what is actually published (or say so per field), never by a label
  that leaves a creative guessing which of their details leave the page.

---

## Extending it

Add a token before adding a one-off value. If a screen needs something the
system cannot express, the system is what should change — a component that
reaches past it with arbitrary values is how a design system dies.

Two things are deliberately **not** built yet:

- ~~**Dark mode.**~~ **Done.** The palette follows `prefers-color-scheme` by
  default (System). Account → Appearance can pin Light or Dark; nothing is
  stored until someone chooses. **Never** add a Tailwind `dark:` variant in a
  component — if something looks wrong in one theme, fix the token.
- **Form primitives beyond `Input` and `Select`.** Textarea, checkbox, radio,
  and combobox will be needed for denser flows. Build them against these tokens.
