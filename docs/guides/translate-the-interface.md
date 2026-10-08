# Translate the interface

For whoever is writing Filipino or Waray copy. You do not need to run the app,
and you never open a component.

Decided in
[ADR 0054](../decisions/0054-copy-is-translated-per-device-never-by-machine.md).

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
  en.ts     English — the source. Do not edit when translating.
  fil.ts    Filipino
  war.ts    Waray
```

Each file is a flat list of keys and strings:

```ts
export const war: Catalog = {
  'signIn.heading': '',
  'signIn.intro': '',
};
```

Fill in the right-hand side. Leave the key alone — it names *where* the string
appears, not what it says, so rewording English never renames a key.

Read the English in `en.ts` for the same key to see what you are translating.

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

## When you are done

A developer runs:

```bash
npm --prefix frontend run test
npm --prefix frontend run build
```

`catalogs.test.ts` fails if a file is missing a key English has, so a new
string can never be silently absent from a language.

## Adding a language

1. Copy `fil.ts` to the new code, empty every value, rename the export.
2. Add it to `LOCALES` in `frontend/src/lib/locale.ts` and to the `Locale`
   union, labelled **in its own language** — the person who needs the control
   is the one who cannot read an English label.
3. Add a loader line in `frontend/src/i18n/I18nProvider.tsx`.
4. Add it to `CATALOGS` in `catalogs.test.ts`.

Catalogues are fetched only when chosen, so a new language costs an
English-only visitor nothing (constraint 3).

## What is not covered yet

- **Most of the app.** Only sign-in and the language control read from a
  catalogue so far. Everything else is still English in the component.
- **The privacy notice and terms.** The most important thing to translate and
  the one place a wrong translation is a legal problem, not a copy problem.
  They are not wired up yet.
- **Messages from the server.** API errors arrive in English and are shown as
  they come, so a translated screen can still show an English error.
