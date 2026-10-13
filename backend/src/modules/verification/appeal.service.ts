import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { idVerifications } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { checkCredentials } from '../auth/auth.service.js';
import { latestIdVerification } from './verification.service.js';
import { appealDeadline, DECISION_WINDOW_MS } from './window.js';

/**
 * A person's one appeal against a *not from Biliran* decline (ADR 0057, plan
 * 0053 Step 4.2). The account cannot sign in, so the appeal carries its
 * username and password and is checked exactly as sign-in is. No session is
 * made: the account stays unusable until an administrator grants the appeal.
 */
export async function appealIdDecision(input: {
  username: string;
  password: string;
  message: string;
  now?: Date;
}): Promise<{ status: 'appealed' }> {
  const now = input.now ?? new Date();
  const user = await checkCredentials(input.username, input.password);

  // Told only after the right password, like the decline itself.
  const latest = await latestIdVerification(user.id);
  if (!latest || !appealDeadline(latest, now)) {
    throw closed(refusal(latest, now));
  }

  // Guarded on everything the deadline checked, in the write itself: the
  // hourly deletion claims a row on the same conditions, so whichever writes
  // first wins, and an appeal never opens on photos already gone.
  const [appealed] = await db
    .update(idVerifications)
    .set({ status: 'appealed', appealMessage: input.message, appealedAt: now, updatedAt: now })
    .where(
      and(
        eq(idVerifications.id, latest.id),
        eq(idVerifications.status, 'declined_final'),
        isNull(idVerifications.appealedAt),
        isNull(idVerifications.appealDecidedAt),
        isNull(idVerifications.imagesDeletedAt),
        gt(idVerifications.decidedAt, new Date(now.getTime() - DECISION_WINDOW_MS)),
      ),
    )
    .returning({ id: idVerifications.id });
  if (!appealed) {
    throw closed('This decision can no longer be appealed.');
  }

  return { status: 'appealed' };
}

/**
 * A 409 with its own code: given only after the right password, so the
 * sign-in limiter does not count it as a guess, just as it does not count
 * `ID_DECLINED`.
 */
function closed(message: string): AppError {
  return new AppError(409, 'ID_APPEAL_CLOSED', message);
}

/** Why there is nothing to appeal, in words the person can act on. */
function refusal(row: Awaited<ReturnType<typeof latestIdVerification>>, now: Date): string {
  if (!row || (row.status !== 'declined_final' && row.status !== 'appealed')) {
    return 'There is no decision on this account to appeal.';
  }
  if (row.status === 'appealed') return 'Your appeal is already being reviewed.';
  if (row.appealDecidedAt) return 'Your appeal has been answered. A decision can be appealed only once.';
  if (row.decidedAt && row.decidedAt.getTime() + DECISION_WINDOW_MS <= now.getTime()) {
    return 'The 7 days to appeal this decision are over.';
  }
  return 'This decision can no longer be appealed.';
}
