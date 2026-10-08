/**
 * Language preference — English, Filipino, or Waray (ADR 0053).
 *
 * Deliberately the same shape as `theme-preference.ts`: a device-level choice
 * in `localStorage`, where the default stores nothing at all. Biliran is
 * Waray-speaking and an English-only interface excludes exactly the
 * registrants hardest to reach (constraint 5), so this is not a convenience
 * setting.
 *
 * Per device rather than per account, as the theme is. A shared phone in a
 * barangay hall is a different reader each time, and signing in is not what
 * changes which language somebody reads — nor is a signed-out first visit,
 * which is everyone's first visit.
 */

export type Locale = 'en' | 'fil' | 'war';

/** localStorage key. English is the absence of a value. */
export const LOCALE_STORAGE_KEY = 'bilikha-locale';

/**
 * Each language is named in its own language. The person who needs this
 * control is the one who cannot read an English label, so "Filipino" and
 * "Waray" are the endonyms and not translations of them.
 */
export const LOCALES: ReadonlyArray<{ value: Locale; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
  { value: 'war', label: 'Waray' },
];

export function parseLocale(raw: string | null | undefined): Locale {
  return raw === 'fil' || raw === 'war' ? raw : 'en';
}

export function readLocale(): Locale {
  try {
    return parseLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Private browsing or blocked site data. English is the safe default.
    return 'en';
  }
}

/**
 * Apply without writing storage.
 *
 * `lang` matters beyond tidiness: it is what a screen reader picks a voice
 * from, and reading Waray in an English voice is worse than not reading it.
 */
export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}

/** Persist and apply. English clears the key so a fresh install stays default. */
export function setLocale(locale: Locale): void {
  try {
    if (locale === 'en') {
      localStorage.removeItem(LOCALE_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // Still apply for this session; the choice simply will not survive.
  }
  applyLocale(locale);
}
