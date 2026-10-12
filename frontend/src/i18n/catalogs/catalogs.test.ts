import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en';
import { fil } from './fil';
import { war } from './war';
import { enLegal } from './legal/en';
import { filLegal } from './legal/fil';
import { warLegal } from './legal/war';
import './legal';
import { enOffers } from './offers/en';
import { filOffers } from './offers/fil';
import { warOffers } from './offers/war';
import './offers';
import { enOrganizations } from './organizations/en';
import { filOrganizations } from './organizations/fil';
import { warOrganizations } from './organizations/war';
import './organizations';
import { enVerification } from './verification/en';
import { filVerification } from './verification/fil';
import { warVerification } from './verification/war';
import './verification';
import { enRegister } from './register/en';
import { filRegister } from './register/fil';
import { warRegister } from './register/war';
import './register';
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
  ['offers', enOffers, { fil: filOffers, war: warOffers }],
  ['organizations', enOrganizations, { fil: filOrganizations, war: warOrganizations }],
  ['verification', enVerification, { fil: filVerification, war: warVerification }],
  ['register', enRegister, { fil: filRegister, war: warRegister }],
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
    // Every section's keys, from the table above, so a new section is covered
    // without anyone remembering to list it here.
    const sections = SETS.filter(([name]) => name !== 'core').flatMap(([, english]) =>
      Object.keys(english),
    );
    const shared = sections.filter((key, i) => key in en || sections.indexOf(key) !== i);
    expect(shared).toEqual([]);
  });

  it("falls back to a registered section's English", () => {
    expect(translate(filLegal, 'privacy.title')).toBe(enLegal['privacy.title']);
    expect(resolveMessage(warLegal, 'war', 'privacy.title')).toEqual({
      text: enLegal['privacy.title'],
      lang: 'en',
    });
  });

  it.each(CATALOGS)('%s falls back to English for an untranslated key', (_name, english, catalog) => {
    // Find a key this catalogue has genuinely left empty, rather than assume
    // one: a hard-coded `signIn.heading` broke the moment a speaker translated
    // sign-in. A fully translated catalogue has nothing to fall back on.
    const untranslated = (Object.keys(english) as MessageKey[]).find((key) => !catalog[key]);
    if (!untranslated) return;
    expect(translate(catalog, untranslated)).toBe((english as Record<string, string>)[untranslated]);
  });

  it.each(CATALOGS)('%s uses its own translation wherever one is written', (_name, _english, catalog) => {
    for (const [key, value] of Object.entries(catalog) as [MessageKey, string][]) {
      if (value) expect(translate(catalog, key)).toBe(value);
    }
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
