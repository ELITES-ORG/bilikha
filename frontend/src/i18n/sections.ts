import { readLocale, type Locale } from '@/lib/locale';
import { en, type Catalog, type MessageKey } from './catalogs/en';

/**
 * Catalogue sections: the strings of a lazy route, loaded with the route
 * (ADR 0055, as amended for issue #74).
 *
 * `catalogs/en.ts` is in the first-load bundle, so every string in it is paid
 * for by every visitor on their first visit, including the ones who never open
 * the screen it belongs to. A lazy route's English goes in its own catalogue
 * instead, and the route registers it when its chunk loads — at module scope,
 * so the English is in place before the route's first render and there is no
 * frame of missing text.
 *
 * Translations of a section are held here too, not in the provider's state:
 * the state below changes the moment a file arrives, without waiting on the
 * core catalogue. That is what lets `withSection` promise a page's first
 * render is already in the chosen language.
 */
export interface CatalogSection {
  name: string;
  en: Catalog;
  loaders: Record<Exclude<Locale, 'en'>, () => Promise<Catalog>>;
}

type Translated = Exclude<Locale, 'en'>;

/** Immutable: replaced, never edited, so it can be a `useSyncExternalStore` snapshot. */
export interface SectionsState {
  names: readonly string[];
  translated: Readonly<Partial<Record<Translated, Catalog>>>;
}

const sections = new Map<string, CatalogSection>();
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<Catalog>>();
let english: Catalog = en;
let state: SectionsState = { names: [], translated: {} };

function update(next: SectionsState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Idempotent: a chunk evaluated twice, or by two routes, registers once. */
export function registerSection(section: CatalogSection): void {
  if (sections.has(section.name)) return;
  sections.set(section.name, section);
  english = { ...english, ...section.en };
  update({ ...state, names: [...state.names, section.name] });
}

/**
 * The English for a key, from the core catalogue or a registered section.
 *
 * The key itself if neither has it, which only happens when a lazy route reads
 * a key outside the folder that loads its section — `section-ownership.test.ts`
 * fails the build if any code does.
 */
export function englishFor(key: MessageKey): string {
  return english[key] ?? key;
}

/** A section's translation of a key, once its file has arrived; `undefined` until then or if empty. */
export function sectionTranslation(
  translated: SectionsState['translated'],
  locale: Translated,
  key: MessageKey,
): string | undefined {
  return translated[locale]?.[key] || undefined;
}

export function sectionsState(): SectionsState {
  return state;
}

export function subscribeToSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fetch one section's translation, once. The result is stored before the
 * returned promise settles, so whoever awaits it can render it immediately. A
 * failed fetch is forgotten, so the next attempt tries again rather than
 * replaying the failure.
 */
export function loadSection(name: string, locale: Translated): Promise<Catalog> {
  const id = `${name}:${locale}`;
  const pending = inFlight.get(id);
  if (pending) return pending;

  const section = sections.get(name);
  const load = (section ? section.loaders[locale]() : Promise.resolve({})).then(
    (catalog) => {
      update({
        ...state,
        translated: { ...state.translated, [locale]: { ...state.translated[locale], ...catalog } },
      });
      return catalog;
    },
    (error: unknown) => {
      inFlight.delete(id);
      throw error;
    },
  );
  inFlight.set(id, load);
  return load;
}

/** Start each named section's translation for a language. */
export function loadSections(names: readonly string[], locale: Translated): void {
  for (const name of names) {
    // A failure leaves the English, which is already on screen.
    loadSection(name, locale).catch(() => {});
  }
}

/** Long enough for a small file on a slow connection; short enough not to strand a reader. */
export const SECTION_WAIT_MS = 3000;

/**
 * For a lazy route's `import()`: hold the route until the chosen language's
 * translation of its section has arrived, so a Waray reader sees the page once,
 * in Waray, rather than in English and then again in Waray. A consent document
 * that changes language under the reader is worse than one that arrives a
 * moment later.
 *
 * English readers wait for nothing. A failed fetch, or one slower than
 * `SECTION_WAIT_MS`, lets the page render in English, and the translation
 * replaces it if it arrives later.
 */
export function withSection(name: string, waitMs = SECTION_WAIT_MS) {
  return async <T>(module: T): Promise<T> => {
    const locale = readLocale();
    if (locale === 'en') return module;

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      loadSection(name, locale).catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(resolve, waitMs);
      }),
    ]);
    clearTimeout(timer);
    return module;
  };
}
