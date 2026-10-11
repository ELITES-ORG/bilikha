# Translate the interface

For whoever is writing Filipino or Waray copy. You do not need to run the app,
and you never open a component.

Decided in
[ADR 0055](../decisions/0055-copy-is-translated-per-device-never-by-machine.md).

---

## The one rule

**Nothing here may be machine-translated.** Not through Google Translate, not
through an AI assistant, not "just to see how the layout holds".

Generated Waray reads as plausible to someone who does not speak it and wrong
to someone who does. Bilikha is a public registry of named neighbours in a
province where everyone knows everyone, and copy that reads as foreign is copy
that costs trust. For the privacy notice and the terms it is worse than that:
people *consent* to those under RA 10173, and consent to a document nobody
competent has read is not informed consent.

An untranslated string falls back to English, visibly. That is the designed
behaviour. **A missing translation is honest; a fabricated one is not.**

If you are not a fluent speaker, leave the value empty and say so.

## Where the words are

```
frontend/src/i18n/catalogs/
  en.ts       English — the source. Do not edit when translating.
  fil.ts      Filipino
  war.ts      Waray
  legal/      The privacy notice and the terms of use
    en.ts     English — the source
    fil.ts    Filipino
    war.ts    Waray
  register/   The registration page
    en.ts     English — the source
    fil.ts    Filipino
    war.ts    Waray
```

The top-level files hold the screens every visitor loads. A page that loads
only when someone opens it, like the privacy notice and the terms, keeps its
strings in its own folder, so a visitor who never opens it never downloads
them ([ADR 0055, amended](../decisions/0055-copy-is-translated-per-device-never-by-machine.md#amendment--2026-10-11-a-lazy-routes-english-loads-with-the-route)).
Each folder has the same three files and the same rules.

Each file is a flat list of keys and strings:

```ts
export const war: Catalog = {
  'signIn.heading': '',
  'signIn.intro': '',
};
```

Fill in the right-hand side. Leave the key alone — it names *where* the string
appears, not what it says, so rewording English never renames a key.

Read the English for the same key in the `en.ts` beside your file to see what
you are translating.

## While you work

- **Keep the meaning, not the words.** These are instructions to someone on a
  phone, not literature. If the English is stiff, the translation does not have
  to be.
- **Longer is fine.** Filipino and Waray run longer than English and the
  layouts are built for it. Do not compress a sentence to fit a button.
- **Leave anything you are unsure of empty** rather than guessing. English is a
  better fallback than a wrong translation.
- **Names stay as they are** — Bilikha, the municipality names, the nine
  statutory domain names.
- **A sentence with a link in it is three keys.** The registration consent
  lines are split as `…Before`, `…Link` and `…After`, and the page shows them
  in that order. Put the link text wherever your sentence needs it: if the link
  belongs at the end, put the whole lead-in in `…Before` and only the closing
  punctuation in `…After`. Keep any space you need inside your own text — the
  page adds none, so `…Before` usually ends with a space. Fill all three
  together, because a sentence translated in one part and English in another
  reads as a broken sentence. If your sentence needs the link at the very
  start, ask a developer rather than leaving `…Before` blank: an empty value
  means "not translated" and shows the English part instead.

## The privacy notice and the terms of use

These are the `privacy.*`, `terms.*` and `legal.*` keys, in `catalogs/legal/`.
They are different from
everything else in the catalogue, because people **consent** to them under
RA 10173, and a translation a person agreed to is a legal record, not copy.

**Do not translate them until two questions are answered** — both are
reyxdz's, and both are written at the top of `legal/en.ts`:

1. **Which version wins** if a translation and the English say different
   things?
2. **Should an account record which language its owner agreed in?** Today it
   records only the date (`users.consent_version`).

Once they are, the rule is stricter here than anywhere else: written or
reviewed by a fluent speaker, no machine translation of any part.

How the text is split, so the English reads exactly as before:

- **`…Lead` is a bold phrase, and `…Rest` continues the same sentence.** A
  `…Rest` key keeps its own leading space or comma — `', which is how you sign
  in.'` — so keep that in your translation.
- **`…Before` and `…After` sit either side of something you do not translate**:
  a link, a name, a code word or a value. Those are the operator's name
  (*Provincial Government of Biliran*), *Elites*, the cookie name
  `bilikha.sid`, the contact address, and the *Last updated* date.
- **The *Last updated* date stays in English.** It is a fixed value naming when
  the English documents changed, not text to translate.

## When you are done

A developer runs:

```bash
npm --prefix frontend run test
npm --prefix frontend run build
```

`catalogs.test.ts` fails if a file is missing a key the English beside it has,
so a new string can never be silently absent from a language.

## Adding a language

1. Copy `fil.ts` to the new code, empty every value, rename the export. Do the
   same in every folder under `catalogs/`, such as `legal/fil.ts`.
2. Add it to `LOCALES` in `frontend/src/lib/locale.ts` and to the `Locale`
   union, labelled **in its own language** — the person who needs the control
   is the one who cannot read an English label.
3. Add a loader line in `frontend/src/i18n/I18nProvider.tsx`, and one in each
   folder's `index.ts`, such as `catalogs/legal/index.ts`.
4. Add it to every set in `SETS` in `catalogs.test.ts`.

Catalogues are fetched only when chosen, so a new language costs an
English-only visitor nothing (constraint 3).

## What is not covered yet

- **Most of the app.** Sign-in, registration, the privacy notice, the terms of
  use and the language control read from a catalogue so far. Everything else
  is still English in the component.
- **Some registration text cannot carry its language yet.** Hints,
  placeholders, error messages and the municipality and barangay labels are
  plain-text props on `Input` and `Select`, so a translated hint is announced
  with the page's English voice by a screen reader. Headings, field labels,
  buttons and the consent sentences are marked correctly.
- **The privacy notice and terms are wired up but must not be translated yet.**
  See *The privacy notice and the terms of use* above — two questions come
  first.
- **Messages from the server.** API errors arrive in English and are shown as
  they come, so a translated screen can still show an English error.
