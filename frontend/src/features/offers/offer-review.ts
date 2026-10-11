import type { OwnOffer } from './api';

export type ReviewNoticeTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface ReviewNotice {
  tone: ReviewNoticeTone;
  /** A few words, for the badge. */
  label: string;
  /** What it means for the creative, and what to do, in a sentence. */
  detail: string;
}

/**
 * Where one of the creative's own offers stands in review (ADR 0058), in their
 * terms. A reason an administrator gave is quoted as it was written.
 */
export function reviewNotice(
  offer: Pick<OwnOffer, 'status' | 'rejectionReason' | 'revisionRejectionReason' | 'pendingChanges'>,
): ReviewNotice {
  if (offer.status === 'pending_review') {
    return {
      tone: 'warning',
      label: 'Waiting for review',
      detail: 'Clients will see it once an administrator approves it.',
    };
  }
  if (offer.status === 'rejected') {
    return {
      tone: 'danger',
      label: 'Not approved',
      detail: offer.rejectionReason
        ? `${offer.rejectionReason} Change it and save to send it back for review.`
        : 'Change it and save to send it back for review.',
    };
  }
  if (offer.pendingChanges) {
    return {
      tone: 'warning',
      label: 'Changes waiting for review',
      detail: 'Clients see the approved version until your changes are approved.',
    };
  }
  if (offer.revisionRejectionReason) {
    return {
      tone: 'danger',
      label: 'Last changes not approved',
      detail: `${offer.revisionRejectionReason} The approved version is still showing.`,
    };
  }
  return { tone: 'success', label: 'Live', detail: 'Clients can find it in the directory.' };
}

/** A save, in the words that fit where the offer stands. */
export function savedMessage(offer: Pick<OwnOffer, 'status' | 'pendingChanges'>, created: boolean): string {
  if (created) return 'Offer sent for review';
  if (offer.status === 'published') {
    return offer.pendingChanges ? 'Changes sent for review' : 'Changes withdrawn — the approved version stays';
  }
  return offer.status === 'pending_review' ? 'Saved and waiting for review' : 'Changes saved';
}
