import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fil } from './fil';
import { war } from './war';
import { resolveMessage, translate } from '../i18n-context';

/**
 * The guard that keeps a translator's file in step with the interface
 * (ADR 0054). Without it, a key added to English is simply absent elsewhere
 * and nobody finds out until a reader meets an English string on a page they
 * chose to read in Waray.
 */
const CATALOGS = [
  ['fil', fil],
  ['war', war],
] as const;

describe('catalogues', () => {
  it.each(CATALOGS)('%s has exactly the English key set', (_name, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
  });

  it('English has no empty values — it is the fallback', () => {
    const empty = Object.entries(en)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it.each(CATALOGS)('%s falls back to English for an untranslated key', (_name, catalog) => {
    expect(translate(catalog, 'signIn.heading')).toBe(en['signIn.heading']);
  });

  it('prefers a real translation over the English fallback', () => {
    expect(translate({ 'signIn.heading': 'Sumulod' }, 'signIn.heading')).toBe('Sumulod');
  });

  it('treats an empty string as untranslated, not as blank copy', () => {
    // The whole file ships as empty strings, so this is the case that decides
    // whether an untranslated screen reads English or reads nothing at all.
    expect(translate({ 'signIn.heading': '' }, 'signIn.heading')).toBe(en['signIn.heading']);
  });

  it('identifies fallback copy as English for assistive technology', () => {
    expect(resolveMessage({ 'signIn.heading': '' }, 'war', 'signIn.heading')).toEqual({
      text: 'Sign in',
      lang: 'en',
    });
  });

  it('identifies translated copy as the selected language', () => {
    expect(resolveMessage({ 'signIn.heading': 'Waray heading' }, 'war', 'signIn.heading')).toEqual({
      text: 'Waray heading',
      lang: 'war',
    });
  });
});
