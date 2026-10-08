import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyLocale, readLocale, setLocale, type Locale } from '@/lib/locale';
import { en, type Catalog, type MessageKey } from './catalogs/en';
import { I18nContext, translate, type I18nApi } from './i18n-context';

/**
 * Holds the chosen language and its catalogue (ADR 0053).
 *
 * English is bundled and every other catalogue is a dynamic `import()`, so an
 * English-only visitor — which on a first visit is everyone — fetches nothing
 * extra. The cost is a frame of English before a chosen catalogue arrives on a
 * cold load, which is the right way round on metered data (constraint 3).
 *
 * No translation library. `react-i18next` and its peers are 15–40 KB for
 * plural rules, interpolation grammar and a backend plugin chain, none of
 * which this needs for a flat key-to-string map.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Catalog>> = {
  fil: () => import('./catalogs/fil').then((m) => m.fil),
  war: () => import('./catalogs/war').then((m) => m.war),
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readLocale());
  const [loaded, setLoaded] = useState<{ locale: Locale; catalog: Catalog } | null>(null);

  /**
   * Derived, not mirrored in state. Keying the loaded catalogue by the locale
   * it belongs to is what stops a switch from `fil` to `war` rendering a frame
   * of Filipino while the Waray chunk is in flight — the stale catalogue is
   * simply not the active one any more, so it is never used.
   */
  const catalog: Catalog = locale === 'en' || loaded?.locale !== locale ? en : loaded.catalog;

  // `lang` is what a screen reader picks a voice from, so it has to follow the
  // choice even before the catalogue has arrived.
  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (locale === 'en') return;

    let cancelled = false;
    void LOADERS[locale]()
      .then((next) => {
        if (!cancelled) setLoaded({ locale, catalog: next });
      })
      .catch(() => {
        // Offline, or a chunk from a build that no longer exists. English is
        // already on screen and every key resolves against it, so there is
        // nothing to recover and nothing worth telling the reader.
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const choose = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback((key: MessageKey) => translate(catalog, key), [catalog]);

  const value = useMemo<I18nApi>(() => ({ locale, choose, t }), [locale, choose, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
