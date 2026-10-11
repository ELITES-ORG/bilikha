import type { OffersKey } from '@/i18n/catalogs/offers/en';
import type { OwnOffer } from './api';

export type ReviewState = 'pending' | 'rejected' | 'changesPending' | 'changesRejected' | 'live';

export interface ReviewNotice {
  state: ReviewState;
  /**
   * The administrator's own words, exactly as written — never merged into the
   * app's copy, so the creative can tell what they were told from what to do.
   */
  reason: string | null;
}

/** Where one of the creative's own offers stands in review (ADR 0058). */
export function reviewNotice(
  offer: Pick<OwnOffer, 'status' | 'rejectionReason' | 'revisionRejectionReason' | 'pendingChanges'>,
): ReviewNotice {
  if (offer.status === 'pending_review') return { state: 'pending', reason: null };
  if (offer.status === 'rejected') {
    return { state: 'rejected', reason: offer.rejectionReason?.trim() || null };
  }
  if (offer.pendingChanges) return { state: 'changesPending', reason: null };
  if (offer.revisionRejectionReason?.trim()) {
    return { state: 'changesRejected', reason: offer.revisionRejectionReason.trim() };
  }
  return { state: 'live', reason: null };
}

/** A save, in the words that fit where the offer stands: a catalogue key, for the toast. */
export function savedMessage(offer: Pick<OwnOffer, 'status' | 'pendingChanges'>, created: boolean): OffersKey {
  if (created) return 'offers.saved.created';
  if (offer.status === 'published') {
    return offer.pendingChanges ? 'offers.saved.changesSent' : 'offers.saved.changesWithdrawn';
  }
  return offer.status === 'pending_review' ? 'offers.saved.waiting' : 'offers.saved.changes';
}
