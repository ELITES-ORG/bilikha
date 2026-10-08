import { createContext, useContext } from 'react';
import type { Locale } from '@/lib/locale';
import { en, type Catalog, type MessageKey } from './catalogs/en';

/**
 * Split from the provider so that file exports only components, which is what
 * keeps fast refresh working — the same reason `toast-context.ts` is separate
 * from `Toast.tsx`.
 */
export interface I18nApi {
  locale: Locale;
  choose: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  message: (key: MessageKey) => ResolvedMessage;
}

export interface ResolvedMessage {
  text: string;
  lang: Locale;
}

/**
 * Resolve a key against a catalogue, falling back to English.
 *
 * An empty string falls back too, not just a missing key: an untranslated
 * entry is committed as `''` (ADR 0055), and rendering nothing would turn a
 * missing translation into a blank screen instead of an English one.
 */
export function translate(catalog: Catalog, key: MessageKey): string {
  const value = catalog[key];
  return value !== undefined && value !== '' ? value : en[key];
}

/** Resolve both the copy and the language it is actually written in. */
export function resolveMessage(
  catalog: Catalog,
  locale: Locale,
  key: MessageKey,
): ResolvedMessage {
  const value = catalog[key];
  return value !== undefined && value !== ''
    ? { text: value, lang: locale }
    : { text: en[key], lang: 'en' };
}

/**
 * English with no catalogue loaded. Used before the provider mounts and as the
 * value for any tree that forgets it, so a missing provider degrades to
 * English rather than throwing — this wraps the whole router, and a crash here
 * would be the whole app.
 */
export const I18nContext = createContext<I18nApi>({
  locale: 'en',
  choose: () => {},
  t: (key) => en[key],
  message: (key) => ({ text: en[key], lang: 'en' }),
});

export function useI18n(): I18nApi {
  return useContext(I18nContext);
}

/** The common case: just the translator. */
export function useT(): (key: MessageKey) => string {
  return useContext(I18nContext).t;
}
