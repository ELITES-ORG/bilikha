/**
 * Waray — **not yet translated.**
 *
 * Every value here must be written or reviewed by a fluent speaker. Machine
 * translation is not acceptable in this file, including "just to see the
 * layout" (ADR 0053 §4): generated Waray reads as plausible to a
 * non-speaker and wrong to a speaker, which is the worst combination for a
 * registry whose whole problem is trust in a small province.
 *
 * An empty value falls back to English, visibly and on purpose. A missing
 * translation is honest; a fabricated one is not.
 *
 * Keys must match `en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from './en';

export const war: Catalog = {
  'signIn.eyebrow': '',
  'signIn.heading': '',
  'signIn.intro': '',
  'signIn.username': '',
  'signIn.password': '',
  'signIn.submit': '',
  'signIn.register': '',
  'signIn.noSelfService': '',
  'account.language.label': '',
  'account.language.description': '',
};
