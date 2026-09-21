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
  agreements: {
    total: number;
    awaitingClientAcceptance: number;
    inProgress: number;
    awaitingClientConfirmation: number;
    completed: number;
    cancelled: number;
  };
  /** Centavos, summed from line items. Never a float, never pesos. */
  money: { agreedCentavos: number; completedCentavos: number };
  ratings: RatingSummary;
}
