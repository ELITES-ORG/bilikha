# 0050. Language choice, and the first translation-ready screen

- **Status:** Complete
- **Owner:** userMarcPaul
- **Related:** [ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md) ·
  [ADR 0026](../decisions/0026-dark-mode-follows-the-device.md) ·
  [plan 0024](./0024-theme-choice.md) ·
  [constraints §3 and §5](../explanation/constraints.md) ·
  [`frontend/DESIGN.md`](../../frontend/DESIGN.md) ·
  [issue #26](https://github.com/ELITES-ORG/bilikha/issues/26)

## Goal

Somebody can choose Filipino or Waray in the account hub, the choice survives a
reload on that device, and the chosen catalogue is fetched only when it is
chosen. One screen — sign-in — reads all of its copy from the catalogue as the
worked example that every later screen copies. Until fluent speakers supply the
words, its empty Filipino and Waray entries intentionally render English.

## What this plan does not do

**It ships no Filipino or Waray words.** Issue #26 leaves three decisions to
reyxdz — which languages come first, who translates and reviews, and what the
first pass covers — and
[ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md)
rules out filling the gap with machine output. So the catalogues are committed
with every key present and every value empty, the runtime falls back to
English, and a translator fills them in without opening a component.

The privacy notice and terms are **out of scope here** for the same reason, and
a stronger one: they are consented to under RA 10173, so a fabricated
translation is a legal defect rather than a copy defect. They are the first
thing to translate once a speaker is found, not the first thing to wire up.

## Rules for whoever executes this

- **Read [ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md).**
  Especially §4 — no machine translation, ever, including "just to see the
  layout".
- `frontend/src/lib/theme-preference.ts` is the shape to copy. Same storage
  discipline, same try/catch, same "nothing stored means the default".
- Tokens only; no new dependency.

## Prerequisites

- [x] Branch `feat/language-choice` cut fresh from `origin/main` (ADR 0052).
- [x] ADR 0055 Accepted by reyxdz before the merge-ready repair.

## Progress

| Phase | Steps | Status |
|---|---|---|
| 1. The locale itself | 3 / 3 | Done |
| 2. The runtime | 3 / 3 | Done |
| 3. The control | 2 / 2 | Done |
| 4. The first screen | 2 / 2 | Done |
| 5. Documentation | 2 / 2 | Done |

---

## Phase 1 — The locale itself

### Step 1.1 — The locale module

- [x] **Action.** Create `frontend/src/lib/locale.ts` mirroring
      `theme-preference.ts`: a `Locale` union (`'en' | 'fil' | 'war'`), the
      `bilikha-locale` storage key, `parseLocale`, `readLocale`,
      `setLocale`, and `applyLocale` which sets `document.documentElement.lang`.
      English stores nothing, as `system` does for the theme.
- [x] **Verify.** `npm --prefix frontend run typecheck` passes.

### Step 1.2 — Test the storage rules

- [x] **Action.** Create `frontend/src/lib/locale.test.ts`, following
      `theme-preference.test.ts`: an unknown or absent value reads as `en`;
      choosing `en` clears the key rather than writing it; a throwing
      `localStorage` does not crash the caller.
- [x] **Verify.** `npm --prefix frontend run test` passes.

### Step 1.3 — `<html lang>` follows the choice

- [x] **Action.** `applyLocale` sets `lang` on `<html>`. `frontend/index.html`
      ships `lang="en"`, which stays as the pre-paint default.
- [x] **Verify.** Switching to Filipino sets `document.documentElement.lang`
      to `fil`; a reload keeps it.

---

## Phase 2 — The runtime

### Step 2.1 — The English catalogue

- [x] **Action.** Create `frontend/src/i18n/catalogs/en.ts` exporting a flat
      object of dotted keys. It is the source of truth and the fallback, and
      it is bundled, because it is the interface text rather than an extra.
- [x] **Verify.** `npm --prefix frontend run typecheck` passes.

### Step 2.2 — The provider and `useT`

- [x] **Action.** Create `frontend/src/i18n/I18nProvider.tsx` and
      `frontend/src/i18n/i18n-context.ts`. The provider holds the active locale and
      its catalogue, fetches a non-English catalogue with a dynamic
      `import()`, and falls back to English for a key whose value is empty or
      missing. Mount it in `frontend/src/App.tsx` above the router. No
      dependency.
- [x] **Verify.** `t` returns the English string for an untranslated key, not
      the key itself and not an empty string. Covered by a test.

### Step 2.3 — The empty catalogues

- [x] **Action.** Create `frontend/src/i18n/catalogs/fil.ts` and `war.ts` with
      every key from `en.ts` present and every value `''`. A header comment
      says plainly that a value must be written or reviewed by a fluent
      speaker and that machine output is not acceptable (ADR 0055 §4).
- [x] **Verify.** A test asserts the three catalogues have identical key sets,
      so a key added to English can never be silently missing elsewhere.

---

## Phase 3 — The control

### Step 3.1 — Language in the account hub

- [x] **Action.** Add a `LanguageRow` to `frontend/src/pages/account/AccountPage.tsx`,
      directly mirroring `AppearanceRow` — same `SettingRow`, same
      `segmentTrackClass` radiogroup. Label each language in its own language
      (`English`, `Filipino`, `Waray`), never in English, because the person
      who needs the control is the one who cannot read the English label.
- [x] **Verify.** `npm --prefix frontend run lint` and `typecheck` pass.

### Step 3.2 — The budget does not move

- [x] **Action.** None; this is the check.
- [x] **Verify.** `npm --prefix frontend run build && npm run check:bundle`.
      `fil` and `war` appear as their own chunks in the build output, not in
      the entry, and the initial figures are unchanged.

---

## Phase 4 — The first translation-ready screen

### Step 4.1 — Prepare sign-in for human translation

- [x] **Action.** Replace the literal strings in
      `frontend/src/pages/LoginPage.tsx` with `t('signIn.…')` keys and add them
      to `en.ts`. Sign-in is the worked example because it is small,
      self-contained, and the screen every returning registrant meets.
- [x] **Verify.** The page is unchanged in English; switching language leaves
      it in English too, because no translation exists yet. Fallback copy is
      marked `lang="en"` so assistive technology does not pronounce it as if it
      were Filipino or Waray.

### Step 4.2 — Check it at 360px in both themes

- [x] **Action.** Render sign-in at 360px, light and dark, with the longest
      placeholder text available.
- [x] **Verify.** No horizontal scroll; nothing truncated.

---

## Phase 5 — Documentation

### Step 5.1 — A guide for whoever translates

- [x] **Action.** Create `docs/guides/translate-the-interface.md`: where the
      catalogues are, that English is the source, that an empty value falls
      back, the no-machine-translation rule and why, and how to add a language.
      Aimed at a translator, not a developer.
- [x] **Verify.** `npm run docs:check` passes.

### Step 5.2 — Point the UI guide at it

- [x] **Action.** Add a line to `frontend/DESIGN.md` saying user-facing copy
      goes in a catalogue, not in a component.
- [x] **Verify.** `npm run docs:check` passes.

---

## Acceptance

- [x] Choosing Filipino or Waray survives a reload on that device.
- [x] `<html lang>` matches the choice.
- [x] Existing hard-coded and fallback copy keeps English language metadata;
      future translated catalogue values carry the selected language metadata.
- [x] An English-only visitor downloads no catalogue but `en`.
- [x] An untranslated key renders its English string.
- [x] The three catalogues have identical key sets, enforced by a test.
- [x] Sign-in reads from the catalogue, and is unchanged on screen.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check` and
      `npm run check:bundle` pass, with the budget unchanged.

## Follow-ups

- **The words.** Nothing is translated until reyxdz names the languages and
  finds speakers. That is the whole value of this feature and none of it is
  here.
- **The privacy notice and terms** are the first thing to translate, and the
  one place a wrong translation is a legal problem.
- **Server copy is not covered.** `AppError` messages reach the user in
  English, so a translated screen can still show an English error. Needs its
  own decision about whether the API returns codes the client renders.
- **Nothing stops a developer hard-coding a string back into a component**,
  where no translator will find it. A lint rule for literal text in JSX is the
  obvious guard and is not built.
- **No first-visit hint.** `Accept-Language` is a poor signal here (ADR 0055),
  but some prompt for a first-time visitor is probably better than none.
