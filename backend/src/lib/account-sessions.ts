import { and, eq, isNull, like, or, type SQL } from 'drizzle-orm';
import { sessions } from '../db/schema/index.js';

/**
 * Every session an account holds, as a WHERE clause.
 *
 * By `user_id`, and by the serialised session for any row still without one — a
 * session signed in by an earlier build during a deploy, and not used since,
 * has not had `user_id` written yet. Missing it would let it back in.
 * `userId` is a validated UUID, so it carries no LIKE wildcards.
 *
 * Shared by the two things that end an account's sessions at once: an
 * administrator's password reset, which deletes them (ADR 0051), and an ID
 * decline, which rewrites them to carry the reason (ADR 0057).
 */
export function accountSessionsWhere(userId: string): SQL {
  return or(
    eq(sessions.userId, userId),
    and(isNull(sessions.userId), like(sessions.data, `%"userId":"${userId}"%`)),
  )!;
}
