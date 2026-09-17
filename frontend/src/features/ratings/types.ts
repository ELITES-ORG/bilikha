/**
 * Shapes returned by the ratings API. No average is ever stored (ADR 0033), so
 * everything here is derived on read and nothing is sent back up except the
 * stars and the note.
 */

/** The rating left on one agreement, read by either party on its record. */
export interface AgreementRating {
  id: string;
  agreementId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the fourteen-day window closes. After it, the server refuses edits. */
  editableUntil: string;
}

/** One review on a creative's public profile. */
export interface ProfileRating {
  id: string;
  stars: number;
  comment: string | null;
  raterName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The score and the count, always together. `average` is null when there is
 * nothing to average — the profile says so in words rather than rendering an
 * empty star row, which reads as zero.
 */
export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface RatingPayload {
  stars: number;
  comment?: string;
}

/** One open appeal in the administrator's queue. */
export interface RatingReport {
  id: string;
  reason: string;
  createdAt: string;
  rating: {
    id: string;
    stars: number;
    comment: string | null;
    createdAt: string;
    agreementId: string;
    packageTitle: string;
  };
  /** The client who left it — the words being appealed are theirs. */
  raterName: string;
  creativeName: string;
  profileSlug: string;
}
