/**
 * Filipino for the empty and error states of the account pages — **not yet translated.**
 *
 * The rules in `../fil.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const filAccount: Catalog = {
  'account.error.account': '',
  'account.error.work': '',
  'account.error.profile': '',
};
