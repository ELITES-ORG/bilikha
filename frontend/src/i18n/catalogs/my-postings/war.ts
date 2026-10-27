/**
 * Waray for the empty states of a client's own postings — **not yet translated.**
 *
 * The rules in `../war.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const warMyPostings: Catalog = {
  'myPostings.post': '',
  'myPostings.empty.title': '',
  'myPostings.empty.description': '',
};
