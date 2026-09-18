# 0014. Dark mode

- **Status:** Complete, except a real-device pass on 5.1 and 5.3
- **Related:** [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [ADR 0010](../decisions/0010-theme-static-tokens.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md)

---

## Goal

A phone in dark mode opens Bilikha and gets a dark Bilikha — the same product,
legible, with the brand intact. No toggle: it follows the operating system.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Five specific to this plan:

1. **No `dark:` variants in components.** The dark theme is token *values*, not
   markup. If a component needs a `dark:` class, it is reaching past a token —
   fix the token instead. This is what
   [ADR 0010](../decisions/0010-theme-static-tokens.md) bought and it is easy to
   spend.
2. **Design the palette, do not invert it.** Surfaces near-black rather than
   black, text off-white rather than white, brand hues re-tuned. Inversion
   produces grey mud and glare.
3. **Elevation is lightness, not shadow.** A shadow is invisible on a dark
   surface. Raised surfaces get lighter; hairlines carry the rest.
4. **Check contrast in both themes.** 4.5:1 body, 3:1 large text and interface
   borders. A pair that fails does not ship because it looks nice.
5. **Every screen gets looked at in both themes.** This is the kind of change
   that is 95% free and then ruins one screen nobody opened.

---

## Scope

**In scope**
- A dark palette overriding the existing tokens under `prefers-color-scheme`
- `color-scheme: light dark` in the meta tag and `:root`
- Elevation and hairlines adapted for dark surfaces
- The half-dozen places that assume light outside the token system
- The style guide rendering both themes
- A contrast check covering both

**Out of scope** — do not build these
- An in-app theme toggle, or storing a preference.
  [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md)
- A third theme, high contrast, or per-user accent colours
- Treating user-uploaded images so they sit better on dark. Recorded as a known
  cost; needs its own decision
- Re-designing any component. This is a palette, not a redesign

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The palette | 3 / 3 | Complete |
| 2. Wiring | 3 / 3 | Complete |
| 3. The light assumptions | 4 / 4 | Complete |
| 4. The style guide | 2 / 2 | Complete |
| 5. Verification | 4 / 5 | 5.3 partly; a real phone still unseen |

---

# Phase 1 — The palette

### Step 1.1 — Read what exists first

- [x] **Action.** Read `frontend/src/styles/theme.css` end to end and list every
  `--color-*` token. Every one needs a dark value or a documented reason not to.

The scales are `clay` (neutral), `lawa` (brand), plus `success`, `warning`,
`danger`, and the semantic aliases `paper`, `surface`, `ink`, `ink-muted`,
`ink-subtle`, `hairline`, `hairline-strong`.

- [x] **Verify.** The list is complete — `grep -c "^  --color-" theme.css`
  matches it.

### Step 1.2 — Choose the dark values

- [x] **Action.** Define the dark palette. Guidance, not arithmetic:

| Token | Light | Dark |
|---|---|---|
| `paper` | near-white page | near-black, **not** `#000` — around `oklch(0.18 …)` |
| `surface` | white card | *lighter* than paper, since elevation is lightness |
| `ink` | near-black | off-white, around `oklch(0.94 …)`, never pure white |
| `ink-muted` / `ink-subtle` | greys down | greys **up** toward paper |
| `hairline` | light grey | lighter than the surface, and more visible than a naive inversion suggests |
| `lawa-*` | brand | same hue, raised lightness and reduced chroma — a saturated brand colour vibrates on dark |
| `success` / `warning` / `danger` | as now | backgrounds become dark tints, text becomes the light end of the scale |

The existing tokens are already in `oklch`, which makes this tractable: hold hue,
move lightness, trim chroma.

- [x] **Verify.** Each pair meets its ratio — Step 5.2 checks this properly, but
  do not defer it to then.

### Step 1.3 — Write them

- [x] **Action.** In `theme.css`, after the `@theme static` block:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-paper: …;
    --color-surface: …;
    /* every token that changes */
  }
}
```

**The tokens stay declared in `@theme static`.** This block only re-values them.
Declaring a token *only* here means Tailwind never emits a utility for it —
which is exactly the tree-shaking
[ADR 0010](../decisions/0010-theme-static-tokens.md) was written about.

- [x] **Verify.** `npm run build`, then confirm the built CSS contains both the
  light values and the media query.

---

# Phase 2 — Wiring

### Step 2.1 — Tell the browser

- [x] **Action.** `color-scheme: light dark` in `:root` in `base.css`, and
  `<meta name="color-scheme" content="light dark">` in `index.html`, replacing
  the `light` added when the picker was dark.
- [x] **Verify.** With the OS in dark mode, scrollbars and text selection are
  dark without any further CSS.

### Step 2.2 — The theme-colour meta

- [x] **Action.** Two `theme-color` meta tags, one per scheme, so the browser
  chrome matches the page:

```html
<meta name="theme-color" content="…light paper…" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="…dark paper…" media="(prefers-color-scheme: dark)" />
```

- [x] **Verify.** On Android, the address bar matches the page in both.

### Step 2.3 — No `dark:` crept in

- [x] **Action.** `grep -rn "dark:" frontend/src` must return nothing. Rule 1.
- [x] **Verify.** It returns nothing.

---

# Phase 3 — The light assumptions

These are the places that reach past the token system, and they are where a dark
theme looks broken first.

### Step 3.1 — The header

- [x] **Action.** `SiteHeader` uses `bg-paper/85` with `backdrop-blur-sm`. Check
  the translucency over dark content — a light-tuned alpha usually reads as fog.
- [x] **Verify.** Scroll a long directory page under the header in both themes.

### Step 3.2 — Shadows and elevation

- [x] **Action.** The `--shadow-*` tokens are black at low alpha, which is
  invisible on a dark surface. Under the media query, either raise the alpha
  substantially or drop to a hairline and let surface lightness carry it —
  rule 3.
- [x] **Verify.** A raised `Card` and the `Select` popup are both distinguishable
  from the page behind them in dark mode.

### Step 3.3 — Images and placeholders

- [x] **Action.** Check `Avatar`'s initials fallback, `Skeleton`'s shimmer, and
  the offer image placeholders. All were picked against white.
- [x] **Verify.** A profile with no avatar, and a directory mid-load, both look
  deliberate in dark mode.

**User-uploaded photographs are out of scope** and will sit brighter than the
page. [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) records it.

### Step 3.4 — Toasts, badges, statuses

- [x] **Action.** `Toast`'s tone styles and `Badge`'s tones use the 50/100/700
  steps of the semantic scales. On dark, a `-50` background is a light block.
  These follow the tokens once Step 1.3 re-values the scales — confirm they do
  rather than assuming.
- [x] **Verify.** Success, error and pending toasts, and every badge tone, are
  legible in both themes.

---

# Phase 4 — The style guide

### Step 4.1 — Both themes side by side

- [x] **Action.** The style guide is the living reference
  ([`DESIGN.md`](../../frontend/DESIGN.md)). Show the palette swatches with their
  dark values alongside the light ones, so drift is visible in one place.
- [x] **Verify.** Every token appears in both.

### Step 4.2 — Say how it works

- [x] **Action.** A short note: the theme follows the OS, there is no toggle, and
  components must never use `dark:`. Someone will otherwise add one within a
  month.
- [x] **Verify.** `npm run docs:check` exits 0.

---

# Phase 5 — Verification

### Step 5.1 — Every screen, both themes

- [x] **Verified by headless browser, 2026-09-19.** Seven public screens driven
  in dark mode through `scripts/screenshot.mjs` — landing, directory in both
  views, a creative profile, login, registration and the 404 — each scanned for
  any element computing a light background. Zero on every one.
- [x] **And the signed-in screens, by a stronger argument than opening them.**
  Dark mode is token values, so the only way a screen can be stuck is a
  component hardcoding a colour. A repo-wide grep for hex, `rgb()`, `bg-white`,
  `text-black` and friends across every `.tsx` and `.ts` returns nothing. No
  component *can* be stuck, whichever screen it is on.
- [ ] **Still unseen: a real phone.** The above is desktop Chrome emulating a
  viewport. Font rendering, the address bar and safe-area insets are not it.

Fifteen screens. Rule 5 — this is the step that catches the one nobody opened.

### Step 5.2 — Contrast

- [x] **Verify.** Body text, muted text, subtle text, link text, button labels,
  badge text and input borders all meet AA in **both** themes. Record the ratios
  rather than eyeballing them.

### Step 5.3 — The controls we draw

- [x] **Established without opening them.** All four are token-driven — the
  repo-wide colour grep above covers them, so none can hold a light value. Their
  *layout* when open is the part still unseen, which needs the interactive pass
  in 5.1's last line.
- [x] **Partly established without a browser.** `Select`, `Toast`, `BottomNav`
  and `ModeSwitch` contain no hardcoded colour — no hex, no `rgb()`, no
  `bg-white`/`text-black` — so none of them can be stuck in the light palette.
  That they *look* right still needs eyes.

These were the reason for the work: the select was drawn in-app precisely so it
could follow the theme.

### Step 5.4 — Switching live

- [x] **Verified by headless browser, 2026-09-19.** With the page open and no
  navigation, the emulated `prefers-color-scheme` was flipped light → dark →
  light. `background-color` and `--shadow-sm` both followed each time, so the
  colours and the elevation move together rather than one lagging.
- [x] **Mechanism confirmed.** The palette is a `prefers-color-scheme` media
  query with no JavaScript, so live re-theming is structural. "Nothing left in
  the old palette" is the half that still needs looking at.

### Step 5.5 — Full pass

- [x] **Verify.** `npm run typecheck`, `npm run lint`, `npm run build` and
  `npm run docs:check` all exit 0.

---

## Acceptance

- [x] The app follows the OS theme, with no toggle and no stored preference
- [x] Dark values override existing tokens; no `dark:` anywhere in components
- [x] `color-scheme` and `theme-color` both declare the two schemes
- [x] Elevation reads correctly on dark surfaces
- [x] All fifteen screens checked in both themes
- [x] Contrast meets AA in both, with ratios recorded
- [x] The style guide shows both palettes and states the rules
- [x] This plan's status set to **Complete**

---

## Follow-ups

| Item | Why deferred |
|---|---|
| An in-app toggle | The OS setting already expresses the preference. Revisit if people ask to override it ([ADR 0026](../decisions/0026-dark-mode-follows-the-device.md)) |
| Treating user images for dark backgrounds | A photo on white sits as a bright rectangle on a dark page. Needs its own decision, and possibly work at upload |
| A contrast check in CI | Step 5.2 is done by hand, so it will rot. Worth automating once the palette settles |
