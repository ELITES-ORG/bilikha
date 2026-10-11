import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fil } from './fil';
import { war } from './war';
import { enLegal } from './legal/en';
import { filLegal } from './legal/fil';
import { warLegal } from './legal/war';
import './legal';
import { enOrganizations } from './organizations/en';
import { filOrganizations } from './organizations/fil';
import { warOrganizations } from './organizations/war';
import './organizations';
import { resolveMessage, translate } from '../i18n-context';

/**
 * The guard that keeps a translator's file in step with the interface
 * (ADR 0055). Without it, a key added to English is simply absent elsewhere
 * and nobody finds out until a reader meets an English string on a page they
 * chose to read in Waray.
 *
 * Checked per set: the core catalogue in the first-load bundle, and each lazy
 * route's section, which a translator edits in its own folder.
 */
const SETS = [
  ['core', en, { fil, war }],
  ['legal', enLegal, { fil: filLegal, war: warLegal }],
  ['organizations', enOrganizations, { fil: filOrganizations, war: warOrganizations }],
] as const;

const CATALOGS = SETS.flatMap(([set, english, translations]) =>
  Object.entries(translations).map(([locale, catalog]) => [`${set}/${locale}`, english, catalog] as const),
);

describe('catalogues', () => {
  it.each(CATALOGS)('%s has exactly the English key set', (_name, english, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(SETS)('%s English has no empty values — it is the fallback', (_name, english) => {
    const empty = Object.entries(english)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('no key is in two sets, so a key has exactly one English', () => {
    const shared = Object.keys(enLegal).filter((key) => key in en);
    expect(shared).toEqual([]);
  });

  it("falls back to a registered section's English", () => {
    expect(translate(filLegal, 'privacy.title')).toBe(enLegal['privacy.title']);
    expect(resolveMessage(warLegal, 'war', 'privacy.title')).toEqual({
      text: enLegal['privacy.title'],
      lang: 'en',
    });
  });

  it.each([fil, war])('core catalogue %# falls back to English for an untranslated key', (catalog) => {
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
