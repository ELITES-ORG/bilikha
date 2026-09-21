/**
 * Centavos per lifecycle state of a creative's agreements (ADR 0039 / plan 0028).
 * Every field is computed on read from rows that already exist — never a
 * counter column or cached total.
 */

import type { OwnProfileStatus } from './me.js';
import type { RatingSummary } from './ratings.js';

export interface WorkSummary {
  profile: {
    slug: string;
    status: OwnProfileStatus;
    editedSinceReviewAt: string | null;
  };
  offers: { total: number; savedByOthers: number };
  inquiries: { total: number; awaitingYourReply: number };
  /**
   * Live engagements only. A superseded version is an earlier draft of the
   * engagement beside it, and a withdrawn one never became anything, so
   * neither is counted — otherwise a single revised agreement reads as two.
   *
   * The states below partition `total` exactly: they sum to it. A count that
   * appears in the total and in no state cannot be reconciled by the person
   * reading it.
   */
  agreements: {
    total: number;
    awaitingClientAcceptance: number;
    /** Accepted, not yet started. */
    agreed: number;
    inProgress: number;
    awaitingClientConfirmation: number;
    completed: number;
    cancelled: number;
  };
  /**
   * Centavos per lifecycle state, mirroring `agreements` and partitioning the
   * same way: the six below sum to `committedCentavos` plus `proposedCentavos`
   * plus `cancelledCentavos`. Superseded and withdrawn contribute nothing.
   *
   * Every figure is what was put in writing. Bilikha does not handle payment
   * and none of this is income (ADR 0039).
   */
  money: {
    /** Issued, not yet accepted — on the table, not promised. */
    proposedCentavos: number;
    /** Accepted, not yet started. */
    agreedCentavos: number;
    inProgressCentavos: number;
    awaitingConfirmationCentavos: number;
    completedCentavos: number;
    /** Accepted and then cancelled. Work that will not happen. */
    cancelledCentavos: number;
    /** Everything a client has accepted and not cancelled. */
    committedCentavos: number;
    /** The middle agreement by value. Null when fewer than two accepted. */
    typicalCentavos: number | null;
  };
  ratings: RatingSummary;
}
