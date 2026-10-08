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

**Type.** Fraunces for headings and the wordmark; Plus Jakarta Sans for UI and
reading text ([ADR 0045](../docs/decisions/0045-headings-stay-in-fraunces.md)).
`.u-display` is Fraunces at weight 600 with optical size raised; `.u-serif` is
the same face, named explicitly for the landing and sign-in headlines. Two
families is the budget
([ADR 0011](../docs/decisions/0011-self-hosted-variable-fonts.md)).

Roles, with the size always chosen at the call site: display `text-5xl`/`6xl`
(serif) · h1 `text-4xl` · h2 `text-3xl` · h3 `text-xl`/`2xl` · body `text-md` ·
small `text-base`/`text-sm` · caption `text-xs`.

**Palette — navy and red** ([ADR 0044](../docs/decisions/0044-navy-and-red-identity.md)).
Neutrals are cool slate on white. `lawa` (navy, `#032B61`) is the primary;
`palayok` (red) is the accent for calls to action and badges. The ramp names
predate the palette: `clay` is slate, `lawa` is navy, `palayok` is red.

**Why not the obvious defaults.** Neutral-black shadows are what a framework
gives you before anyone has made a decision, and are replaced here on purpose.
The single radius is a decision, not a default
([ADR 0048](../docs/decisions/0048-one-radius-for-every-box.md)).

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

- One radius, 8px, on every chip, button, input, card, panel and dialog
  ([ADR 0048](../docs/decisions/0048-one-radius-for-every-box.md)). The
  `rounded-xs` … `rounded-2xl` names all resolve to it. `rounded-full` is only
  for things round by nature: avatars, dots, spinners, the map's pins — never a
  button, chip, badge or icon button.
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
- `Tabs` comes in two looks. `pill` (default) is the segmented control for
  filters and modes. `underline` is for the sections of a page — a profile's
  Services, Portfolio, Reviews — where pills would shout over the content.
- `Tabs` is the segmented control: active tab a navy pill. A radio group that
  should look the same borrows `segmentTrackClass` / `segmentItemClass` and
  keeps its radio semantics.
- `Eyebrow` (red rule + navy uppercase) leads a page title. Plain `.u-eyebrow`
  is for labels inside a card or nav.
- `StatItem`: icon, navy figure, muted label, as a term and description — the
  parent is a `<dl>`. Rows take `divide-x divide-hairline` on the parent;
  `tone="inverse"` on navy, with `divide-on-primary/20` between items and
  `text-on-primary-muted` icons. `href` makes the whole item one link, marked
  with a chevron because touch screens have no hover. `shortLabel` replaces the
  label below `sm`, where a row of three cannot fit two-word labels. Count a
  figure from data the page already has rather than typing it in.
- Decorative shapes come from `components/Decor.tsx` — tokens only,
  `aria-hidden`, never hit-testable, and kept to page margins so they never sit
  under text. Check them at every breakpoint; a corner that is clear at `xl`
  can land on a headline at `sm`.
- Prices are always `text-ink`, bold — never red, never a raw black. They flip
  with the theme like any other text.
- Red is for accents only: the eyebrow rule, badges and counts, and a save heart
  once it is saved. Not for prices, not for hover.
- A card that is a link uses one stretched link (`after:absolute after:inset-0`
  on its "View offer" link, the card `relative`). Any other control on the card
  — the save heart — is a sibling above that layer, never nested in the link.
- Client postings use `PostingCatalogCard` (`features/postings/`). Postings carry
  no image, so the card leads with a soft band naming the domain — never a
  placeholder image that would be identical on every card. Grid columns come
  from an 18rem minimum card width (`postingGridClass`), not from breakpoints.
- `OfferCard` (`features/offers/`) is the one way an offer is shown in a grid:
  4:3 image, the craft as a badge over its corner, price pinned to the bottom so
  a row lines up. Hover is a border shift and a 3% image zoom — no lift, no
  stacked shadow. Grid: `offerGridClass`.
- A form that reports through toasts opens in `OfferFormDialog`'s pattern, not a
  modal `<dialog>` — the top layer would hide the toasts. Full-screen sheet on a
  phone, centred panel from `sm`.
- A list-and-detail surface (messaging) is one screen at a time below `lg` and
  a split view from it: the list stays mounted on the left, the detail changes
  on the right. The URL is the only state — no selected-item store.
- The navy header bar (`<SiteHeader tone="brand" />`) is for the landing page
  only. Elsewhere the bar stays white so it recedes behind the content.
- A loading state is a skeleton of what replaces it — never dots, a spinner,
  or a single grey block. Build it from `components/page-skeleton/parts.tsx`
  so each bar sits in the height of its real line, and share it with the
  page's route fallback; a new route gets an entry in `PageSkeleton.tsx`
  ([ADR 0050](../docs/decisions/0050-loading-states-are-skeletons-of-the-page.md)).

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
- Below the fold, an entrance waits until it is reached: put `data-reveal` on
  the animated element or a wrapper, and call `useRevealOnScroll` on the page's
  root. `data-reveal="stagger"` on list rows staggers only the rows that arrive
  together. An entrance that plays on load below the fold has finished before
  anyone sees it.
- Animated icons live in `components/animated-icons/` (adapted from
  lucide-animated, MIT — keep its `LICENSE` beside them). They pull in `motion`,
  so they are only ever loaded with `lazy()` behind a Suspense fallback of the
  static Lucide icon at the same size; the first page load must not carry them
  ([ADR 0047](../docs/decisions/0047-animated-icons-load-lazily-with-motion.md)).
  They loop only while on screen, take turns rather than move together, and
  stay still under reduced motion. Decorative icons only — never on controls.
- Changes of page get the tide line and the new `main` sliding in
  (`PageTransitions`). A slow first load shows the navy opening curtain, which
  lifts with the wave (`BootCurtain`); never add a spinner of your own to the
  boot path. The branded overlays
  (`transitionTo('wave' | 'bloom' | 'panel')`) are the one exception to the
  200ms rule and belong only on the few links listed in the
  [ADR 0034 amendments](../docs/decisions/0034-navigation-transitions.md), plus
  the browser's back and forward buttons — never on tabs, filters, in-app back
  links or the phone tab bar.
- Everything collapses under `prefers-reduced-motion`: movement is removed,
  opacity survives so state stays legible.

**Screens**

- Design down to 320px wide, and for phones held in landscape (320–430px
  tall). A control that does not fit tightens or stacks — it never wraps into
  a second line inside one pill.
- `short:` (height ≤ 30rem) is for landscape phones: let pinned chrome scroll
  away and cap tall media there. Sticky sub-headers use `short:top-0`.
- Compact sizes are for a mouse, so use `pointer-fine:`, never `sm:`. A phone
  in landscape is wider than `sm` and still a touch screen.
- Every touch target is at least 44px. For a link that must stay visually
  small, add `.u-tap` rather than padding it out.

**Copy**

- User-facing text goes in `src/i18n/catalogs/en.ts` and is read with `useT()`,
  not written into the component. A string hard-coded in JSX is one no
  translator will ever find ([ADR 0054](../docs/decisions/0054-copy-is-translated-per-device-never-by-machine.md)).
- Layouts absorb longer text. Filipino and Waray run longer than English for
  the same sentence, so no fixed-width text containers and no truncation on
  anything load-bearing — checked at 360px.
- **Never machine-translate a catalogue value**, including to preview a
  layout. See [Translate the interface](../docs/guides/translate-the-interface.md).

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
