/**
 * Waray for a creative's own offers — **not yet translated.**
 *
 * The rules in `../war.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const warOffers: Catalog = {
  'offers.review.pending.label': '',
  'offers.review.pending.detail': '',
  'offers.review.rejected.label': '',
  'offers.review.rejected.detail': '',
  'offers.review.changesPending.label': '',
  'offers.review.changesPending.detail': '',
  'offers.review.changesRejected.label': '',
  'offers.review.changesRejected.detail': '',
  'offers.review.live.label': '',
  'offers.review.live.detail': '',
  'offers.review.reasonLabel': '',
  'offers.saved.created': '',
  'offers.saved.changesSent': '',
  'offers.saved.changesWithdrawn': '',
  'offers.saved.waiting': '',
  'offers.saved.changes': '',
};
