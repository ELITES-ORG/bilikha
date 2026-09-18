/**
 * The score and the count, always together. `average` is null when there is
 * nothing to average — the profile says so in words rather than rendering an
 * empty star row, which reads as zero. Never a stored column (ADR 0033).
 */
export interface RatingSummary {
  average: number | null;
  count: number;
}
