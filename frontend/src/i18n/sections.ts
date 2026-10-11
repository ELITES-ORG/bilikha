import type { Locale } from '@/lib/locale';
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
 * Once a section is registered, its English is part of the fallback, and the
 * provider fetches its translation for the chosen language the same way it
 * fetches the core catalogue.
 */
export interface CatalogSection {
  name: string;
  en: Catalog;
  loaders: Record<Exclude<Locale, 'en'>, () => Promise<Catalog>>;
}

const sections = new Map<string, CatalogSection>();
const listeners = new Set<() => void>();
let english: Catalog = en;
let names: readonly string[] = [];

/** Idempotent: a chunk evaluated twice, or by two routes, registers once. */
export function registerSection(section: CatalogSection): void {
  if (sections.has(section.name)) return;
  sections.set(section.name, section);
  english = { ...english, ...section.en };
  names = [...names, section.name];
  for (const listener of listeners) listener();
}

/**
 * The English for a key, from the core catalogue or a registered section.
 *
 * The key itself if neither has it, which only happens when a lazy route reads
 * a key before importing its section — visible on screen, so it is caught the
 * first time anyone opens the page.
 */
export function englishFor(key: MessageKey): string {
  return english[key] ?? key;
}

/** The registered section names, as a stable snapshot for `useSyncExternalStore`. */
export function sectionNames(): readonly string[] {
  return names;
}

export function subscribeToSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function loadSection(name: string, locale: Exclude<Locale, 'en'>): Promise<Catalog> {
  const section = sections.get(name);
  return section ? section.loaders[locale]() : Promise.resolve({});
}
