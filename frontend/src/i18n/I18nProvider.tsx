import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { applyLocale, readLocale, setLocale, type Locale } from '@/lib/locale';
import type { Catalog, MessageKey } from './catalogs/en';
import {
  I18nContext,
  resolveMessage,
  translate,
  type I18nApi,
} from './i18n-context';
import { loadSection, sectionNames, subscribeToSections } from './sections';

/**
 * Holds the chosen language and its catalogue (ADR 0055).
 *
 * English is bundled and every other catalogue is a dynamic `import()`, so an
 * English-only visitor — which on a first visit is everyone — fetches nothing
 * extra. The cost is a frame of English before a chosen catalogue arrives on a
 * cold load, which is the right way round on metered data (constraint 3).
 *
 * A lazy route's strings are a section (`sections.ts`): when the route
 * registers one, the chosen language's translation of it is fetched too.
 *
 * No translation library. `react-i18next` and its peers are 15–40 KB for
 * plural rules, interpolation grammar and a backend plugin chain, none of
 * which this needs for a flat key-to-string map.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Catalog>> = {
  fil: () => import('./catalogs/fil').then((m) => m.fil),
  war: () => import('./catalogs/war').then((m) => m.war),
};

/** `section` is a registered section's name; without one, the core catalogue. */
export type CatalogLoader = (locale: Exclude<Locale, 'en'>, section?: string) => Promise<Catalog>;

function loadCatalog(locale: Exclude<Locale, 'en'>, section?: string): Promise<Catalog> {
  return section ? loadSection(section, locale) : LOADERS[locale]();
}

/** English needs no catalogue: every key falls back to it. */
const ENGLISH: Catalog = {};

export function I18nProvider({
  children,
  catalogLoader = loadCatalog,
}: {
  children: ReactNode;
  catalogLoader?: CatalogLoader;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  const [loaded, setLoaded] = useState<{ locale: Locale; catalog: Catalog } | null>(null);
  const sections = useSyncExternalStore(subscribeToSections, sectionNames);

  /**
   * Derived, not mirrored in state. Keying the loaded catalogue by the locale
   * it belongs to is what stops a switch from `fil` to `war` rendering a frame
   * of Filipino while the Waray chunk is in flight — the stale catalogue is
   * simply not the active one any more, so it is never used.
   */
  const catalog: Catalog = locale === 'en' || loaded?.locale !== locale ? ENGLISH : loaded.catalog;
  const catalogLocale: Locale = locale !== 'en' && loaded?.locale === locale ? locale : 'en';

  // Keep the preference on the document while declaring the app's existing
  // hard-coded and fallback copy as English. A translated message overrides
  // this nearer ancestor with its actual catalogue language.
  useEffect(() => {
    applyLocale(locale);
    const appRoot = document.getElementById('root');
    if (appRoot) appRoot.lang = 'en';
  }, [locale]);

  useEffect(() => {
    if (locale === 'en') return;

    // The core catalogue and every registered section. When a section
    // registers later this runs again and fetches the core catalogue again,
    // which costs nothing: the browser already holds that chunk.
    let cancelled = false;
    void Promise.allSettled(
      [undefined, ...sections].map((section) => catalogLoader(locale, section)),
    ).then((results) => {
      if (cancelled) return;
      // A failed part is offline, or a chunk from a build that no longer
      // exists. English is already on screen and every key resolves against
      // it, so there is nothing to recover and nothing worth telling the
      // reader — and the parts that did arrive are still used.
      const arrived = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      setLoaded((previous) => ({
        locale,
        catalog: Object.assign(
          {},
          previous?.locale === locale ? previous.catalog : undefined,
          ...arrived,
        ) as Catalog,
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [catalogLoader, locale, sections]);

  const choose = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback((key: MessageKey) => translate(catalog, key), [catalog]);
  const message = useCallback(
    (key: MessageKey) => resolveMessage(catalog, catalogLocale, key),
    [catalog, catalogLocale],
  );

  const value = useMemo<I18nApi>(
    () => ({ locale, choose, t, message }),
    [locale, choose, t, message],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
