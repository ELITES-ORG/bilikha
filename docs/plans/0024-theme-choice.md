# 0024. A theme choice, and one palette instead of four

- **Status:** Complete, except the address bar on a real phone
- **Related:** [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [ADR 0027](../decisions/0027-account-is-a-hub.md) ·
  [ADR 0010](../decisions/0010-theme-static-tokens.md)

---

## Goal

System, Light and Dark, chosen on the account hub, remembered, and applied
before the first paint. Underneath, the palette stops being four copies of the
same 65 tokens and becomes one.

---

## Rules for whoever executes this

The rules in [plan 0001](./0001-registration-and-auth.md#rules-for-whoever-executes-this)
apply unchanged. Eight specific to this plan:

1. **System is the default and must stay reachable.** Two options is a one-way
   door: someone who picks Light can never get back to following their phone.
2. **Nothing is stored until a choice is made.** A fresh install behaves exactly
   as it does today.
3. **`color-scheme` is the override.** Do not add a second palette block keyed
   on `[data-theme]`. Lightning CSS resolves `light-dark()` from the computed
   `color-scheme`, so setting that one property moves every colour token
   ([ADR 0026](../decisions/0026-dark-mode-follows-the-device.md)).
4. **Still no `dark:` variants.** [ADR 0010](../decisions/0010-theme-static-tokens.md)
   and ADR 0026 both forbid them, and this plan removes the excuse rather than
   creating one.
5. **Set the attribute before first paint.** A blocking inline script in
   `index.html`, not a `useEffect`. Anything later means someone who chose Light
   sees a dark flash on every load.
6. **Shadows stay selector-based.** They change geometry between themes, not
   just colour, so `light-dark()` cannot carry them. Six tokens; leave them.
7. **Tests ship with it** for whatever is pure logic — reading and validating
   the stored value is; the paint is not.
8. **Do not tick a verification step you did not run.**

---

## Scope

**In scope**
- Colour tokens converted to `light-dark()`, one declaration each
- The dark media query's colour half deleted; the specimen blocks reduced to
  `color-scheme`
- `[data-theme='light'|'dark']` setting `color-scheme`
- A pre-paint inline script
- System / Light / Dark on the account hub, persisted
- The `theme-color` meta following a manual choice

**Out of scope** — do not build these
- Storing the preference on the account or syncing it between devices
- Any `dark:` variant. Rule 4
- Changing a single palette *value*. This is a restructure; the rendered colours
  must be identical afterwards
- A third theme, or per-page themes
- Moving the shadow tokens into `light-dark()`. Rule 6

---

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. One palette | 3 / 3 | Done |
| 2. The override | 2 / 2 | Done |
| 3. The control | 2 / 2 | Done |
| 4. Verification | 4 / 4 | 4.3's phone check needs a real device |

---

# Phase 1 — One palette

### Step 1.1 — Convert the colours

- [x] **Action.** In `@theme static`, give every `--color-*` token both values:
  `light-dark(<current light>, <current dark>)`. The dark value is whatever the
  `@media (prefers-color-scheme: dark)` block sets for that token today.
- [x] **Action.** Work token by token against that block. A token it does not
  override keeps its single value — wrapping an unchanged colour in
  `light-dark(x, x)` is noise.

### Step 1.2 — Delete the copies

- [x] **Action.** Remove the colour declarations from the dark media query,
  leaving only the six `--shadow-*` overrides. Rule 6.
- [x] **Action.** Reduce `[data-theme-specimen='light']` and
  `[data-theme-specimen='dark']` to `color-scheme: light` / `color-scheme: dark`
  plus the shadow overrides. Lightning CSS already flips `light-dark()` from
  `color-scheme` — confirmed in the built stylesheet, where both specimen
  selectors already carry the polyfill's switch.

### Step 1.3 — Prove nothing moved

- [x] **Verify.** Build, then compare the emitted `--color-*` values before and
  after for both themes. Every rendered colour must be identical. This is a
  restructure; a changed colour is a bug, not an improvement.
- [x] **Verify.** The style guide still shows both palettes side by side.
- **Done 2026-09-19.** `/styleguide` renders Light and Dark next to each other
  with every ramp — clay, lawa, palayok, success, warning, danger — which is
  also the check that the `light-dark()` consolidation dropped no token.

---

# Phase 2 — The override

### Step 2.1 — The attribute

- [x] **Action.** `:root[data-theme='light'] { color-scheme: light; }` and
  `:root[data-theme='dark'] { color-scheme: dark; }`. Nothing else — rule 3.
- [x] **Action.** No attribute means no rule, so the media query governs and
  `System` needs no representation in CSS at all.

### Step 2.2 — Before the paint

- [x] **Action.** A small blocking inline script in `index.html` that reads the
  stored value and sets `data-theme` on `<html>`. It runs before the stylesheet
  applies, so there is no flash. Rule 5.
- [x] **Action.** It must not throw when storage is unavailable — private
  browsing and blocked site data both return or throw on access. Wrap it.
- [x] **Action.** The two `theme-color` metas are media-query based and will not
  follow a manual choice. Update the active one from the same script, keeping
  the values matching `--color-paper` in each theme.

---

# Phase 3 — The control

### Step 3.1 — On the hub

- [x] **Action.** Below the four entries on `/account`, an Appearance row with
  three options — System, Light, Dark — as a radio group, not a two-state
  switch. Rule 1.
- [x] **Action.** Match the existing hub rows: same height, same hairline, same
  type. It is a row on that list, not a panel bolted under it.
- [x] **Action.** Choosing writes the preference, sets `data-theme`, and updates
  the `theme-color` meta. Choosing System removes both the stored value and the
  attribute.

### Step 3.2 — The logic, separately

- [x] **Action.** Reading, validating and applying the preference lives in a
  plain module — not inside the component — so it can be tested and so the
  inline script and the control share one definition of what the stored values
  mean.
- [x] **Test.** An absent value, an unrecognised value and a storage read that
  throws all resolve to System. Rule 7.

---

# Phase 4 — Verification

### Step 4.1 — The three choices

- [x] **Verified by headless browser, 2026-09-19.** All four combinations,
  reading the computed values rather than judging by eye:

  | Stored | OS | `data-theme` | body | `color-scheme` | `--shadow-sm` |
  |---|---|---|---|---|---|
  | — | dark | absent | dark paper | — | dark |
  | — | light | absent | light paper | — | light |
  | light | dark | `light` | light paper | `light` | **light** |
  | dark | light | `dark` | dark paper | `dark` | **dark** |

  The last two are the cases the plan's step 2.1 got wrong: shadows follow the
  choice, not the OS, because the implementer paired them onto
  `:root[data-theme]`.

### Step 4.2 — No flash

- [x] **Verify.** Choose Light with the OS in dark, then hard-reload. No dark
  frame at any point. Repeat on a throttled connection, where the gap between
  markup and stylesheet is wide enough to see.
- **Done 2026-09-19.** A settled screenshot cannot answer this, so the run
  records `data-theme` and the computed background on every animation frame
  from first paint. Light chosen with the OS in dark: `data-theme` is already
  `light` on the first frame, and across ~205 painted frames there is exactly
  one background value, the light paper. Not one dark frame.
- **And the inverse**, to prove the check is not vacuous: Dark chosen with the
  OS in light gives one background across every frame too — the dark one. The
  recorder does distinguish them.
- **Throttled**, at 700ms latency and 700kbps, against the *built* app: 678 of
  678 frames painted, all the same light paper, first paint at 1454ms. Run
  against the dev server it proves nothing — Vite pays the latency once per
  module, so nothing paints inside the window at all. That is a dev-server
  artifact, and using it would have produced a tick that meant nothing.

### Step 4.3 — Native surfaces follow

- [x] **Verified for the mechanism.** With a choice disagreeing with the OS,
  the computed `color-scheme` on `:root` is the chosen one, and both
  `theme-color` metas carry the chosen paper with their `media` attribute
  removed. That is what native surfaces read.
- [ ] **Verify.** On a phone, the address bar matches the chosen theme, not the
  OS.

### Step 4.4 — Full pass

- [x] `npm run typecheck`, `lint`, `test`, `build`, `docs:check` all exit 0, and
  CI green. Grep the diff for any `dark:` class and for any second palette block.

Built `--color-*` light/dark pairs matched the pre-restructure values (65/65,
diff count 0). No `dark:` class in the changed files.

Note on Step 2.1: `color-scheme` alone leaves shadow geometry wrong when the
choice disagrees with the OS, so the six `--shadow-*` overrides also sit on
`:root[data-theme]`. That is not a second colour palette.

---

## Acceptance

- System, Light and Dark are all choosable, and System is the default.
- A choice survives a reload with no flash of the other theme.
- `color-scheme` and the `theme-color` meta follow a manual choice.
- The palette is declared once: no dark colour block, no duplicated specimens.
- Every rendered colour is identical to before.
- Nothing is stored until somebody chooses.

---

## Follow-ups

Not in this plan:

- Storing the preference on the account so it follows between devices. Local is
  enough until someone says otherwise.
- Moving the shadow tokens into a shape that avoids the selector override.
- Whether the style guide should offer the same three-way control now that
  forcing a theme is a supported thing rather than a specimen hack.
