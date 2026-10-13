import type { IdVerification } from '../../db/schema/index.js';

/**
 * The 7 days after a decision (ADR 0057): the images are kept, the decision can
 * be changed, and a *not from Biliran* decline can be appealed. They run from
 * the latest decision — the first one, a change, or an appeal's outcome.
 */
export const DECISION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function windowEndsAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + DECISION_WINDOW_MS);
}

/**
 * Until when the person may appeal this decision, or null when they may not.
 *
 * Only a *not from Biliran* decline is appealed — *try again* resubmits — and
 * only once: an appeal already made, or already decided, closes it. It also
 * needs the photos, since the appeal is decided on them, and the 7 days.
 */
export function appealDeadline(
  row: Pick<IdVerification, 'status' | 'decidedAt' | 'appealedAt' | 'appealDecidedAt' | 'imagesDeletedAt'>,
  now: Date,
): Date | null {
  if (row.status !== 'declined_final' || !row.decidedAt) return null;
  if (row.appealedAt || row.appealDecidedAt || row.imagesDeletedAt) return null;
  const ends = windowEndsAt(row.decidedAt);
  return ends.getTime() > now.getTime() ? ends : null;
}
