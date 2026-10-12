/**
 * Filipino for a creative's own offers — **not yet translated.**
 *
 * The rules in `../fil.ts` apply here unchanged: every value is written or
 * reviewed by a fluent speaker, never machine translation (ADR 0055 §4), and
 * an empty value falls back to English on purpose.
 *
 * Keys must match `./en.ts` exactly — `catalogs.test.ts` enforces it.
 */
import type { Catalog } from '../en';

export const filOffers: Catalog = {
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
  'offers.media.heading': '',
  'offers.media.add': '',
  'offers.media.addImage': '',
  'offers.media.limits': '',
  'offers.media.limitsImagesOnly': '',
  'offers.media.quota': '',
  'offers.media.rights': '',
  'offers.media.rightsLink': '',
  'offers.media.uploading': '',
  'offers.media.progress': '',
  'offers.media.cancel': '',
  'offers.media.remove': '',
  'offers.media.leaveWarning': '',
  'offers.media.untitled': '',
  'offers.media.refused.type': '',
  'offers.media.refused.size': '',
  'offers.media.refused.duration': '',
  'offers.media.refused.codec': '',
  'offers.media.refused.unreadable': '',
  'offers.media.refused.count': '',
  'offers.media.refused.quota': '',
  'offers.media.failed': '',
  'offers.media.kind.image': '',
  'offers.media.kind.audio': '',
  'offers.media.kind.video': '',
  'offers.media.kind.document': '',
  'offers.media.state.pendingAdd': '',
  'offers.media.state.pendingRemove': '',
};
