import type { RatingSummary } from './types';

/** Always plural-correct, because it is printed beside a number people read. */
export function reviewsLabel(count: number): string {
  return count === 1 ? '1 review' : `${count} reviews`;
}

/**
 * "4.6 from 12 reviews", or null when there is nothing to say. One decimal, and
 * never the score on its own — plan 0021 rule 4. Callers that get null say so
 * in words rather than rendering an empty star row, which reads as zero.
 */
export function scoreLine(summary: RatingSummary): string | null {
  if (summary.count === 0 || summary.average === null) return null;
  return `${summary.average.toFixed(1)} from ${reviewsLabel(summary.count)}`;
}

/**
 * Whether the fourteen-day window is still open, for deciding whether to offer
 * an Edit control. The server enforces the same window on the write — this only
 * decides what to draw.
 */
export function insideEditWindow(editableUntil: string): boolean {
  return Date.now() < new Date(editableUntil).getTime();
}

export function starsLabel(stars: number): string {
  return stars === 1 ? '1 star out of 5' : `${stars} stars out of 5`;
}
