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

**Type.** Plus Jakarta Sans for headings, UI and reading text; Fraunces only for
the landing hero headline, through `.u-serif`, never below `text-3xl`.
`.u-display` is the heading face at weight 700. Two families is the budget
([ADR 0011](../docs/decisions/0011-self-hosted-variable-fonts.md)).

Roles, with the size always chosen at the call site: display `text-5xl`/`6xl`
(serif) · h1 `text-4xl` · h2 `text-3xl` · h3 `text-xl`/`2xl` · body `text-md` ·
small `text-base`/`text-sm` · caption `text-xs`.

**Palette — navy and red** ([ADR 0044](../docs/decisions/0044-navy-and-red-identity.md)).
Neutrals are cool slate on white. `lawa` (navy, `#032B61`) is the primary;
`palayok` (red) is the accent for calls to action and badges. The ramp names
predate the palette: `clay` is slate, `lawa` is navy, `palayok` is red.

**Why not the obvious defaults.** Neutral-black shadows and one radius applied
to everything are what a framework gives you before anyone has made a decision.
Each is replaced here on purpose.

---

## Rules

**Colour**

- Red is for calls to action, badges and rules. `palayok-500` (`#E63946`) is 4.17:1
  on white, so it is for decoration and large text only; filled buttons and
  badges use `accent-solid` (4.8:1 with white text). Red is never a status
  colour — errors use `danger`, which is deliberately deeper and browner.
- Status is never colour alone. Pair every status badge with an icon or a word.
- Text on white uses steps 600–700. Steps 400 and below fail contrast at body
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
- Off production a sticky staging banner sits above everything, and its height
  is `--staging-banner-h` (zero on production). A full-height screen uses
  `min-h-page`, not `min-h-dvh`. Anything stuck or fixed to the top offsets by
  the variable: `sticky top-(--staging-banner-h)`, never `top-0`.
  `staging-banner.test.ts` enforces both.

**Radius and elevation**

- Radius is graded: `xs` chips, `sm` (12px) buttons and inputs, `md` (16px)
  cards, `lg` (20px) panels and modals. Uniform rounding flattens hierarchy.
- Prefer a hairline to a shadow. Stop at `shadow-lg` for anything in-page;
  `xl` is for overlays only.
- Shadows are ink-tinted (navy-slate). Never introduce a neutral-black one.

**Components**

- Buttons: `primary` navy, `accent` red for the one call to action a screen
  exists for (search the registry, publish), `secondary` white with a navy
  outline, `inverse` on a navy surface. Every size is 44px on a phone; `sm`
  drops to 36px from `sm` up.
- Badges are pills. `variant="solid"` is for counts and flags — red for unread
  and active filters, navy for new or info. `soft` is for labels.
- `Tabs` is the segmented control: active tab a navy pill. A radio group that
  should look the same borrows `segmentTrackClass` / `segmentItemClass` and
  keeps its radio semantics.
- `Eyebrow` (red rule + navy uppercase) leads a page title. Plain `.u-eyebrow`
  is for labels inside a card or nav.
- `StatItem`: icon, navy figure, muted label. Rows take `divide-x
  divide-hairline` on the parent; `tone="inverse"` on navy.
- Decorative shapes come from `components/Decor.tsx` — tokens only,
  `aria-hidden`, never hit-testable, and kept to page margins so they never sit
  under text. Check them at every breakpoint; a corner that is clear at `xl`
  can land on a headline at `sm`.
- The navy header bar (`<SiteHeader tone="brand" />`) is for the landing page
  only. Elsewhere the bar stays white so it recedes behind the content.

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
- A modal scrim uses `scrim`, never `ink`. `ink` is the text colour and inverts
  with the theme, so a scrim built from it turns near-white in dark mode and
  washes the page out instead of dimming it. Every dialog in the app had this
  until it was found in the offer gallery.
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
