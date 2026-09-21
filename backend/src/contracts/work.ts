/**
 * Derived summary of a creative's work on the platform (ADR 0039 / plan 0027).
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
  /** Centavos, summed from line items. Never a float, never pesos. */
  money: { agreedCentavos: number; completedCentavos: number };
  ratings: RatingSummary;
}
