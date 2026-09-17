import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';

/**
 * Reads the account status from the database on every request rather than
 * trusting the session, for the same reason `requireAdmin` re-reads the role:
 * suspending someone has to take effect now, not whenever their session happens
 * to expire.
 *
 * Login already refuses a suspended account, but that only stops a *new* sign
 * in. Sessions last SESSION_TTL_DAYS — thirty by default — so without this an
 * administrator could suspend an abusive account and watch it keep posting
 * work, messaging people and uploading images for a month.
 *
 * The cost is one primary-key lookup per authenticated request. That is the
 * same trade `requireAdmin` already makes, and it is the only way the state is
 * ever correct rather than eventually correct.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = req.session.userId;

  if (!userId) {
    next(AppError.unauthorized('You must be signed in.'));
    return;
  }

  void (async () => {
    try {
      const [user] = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // The row is gone — a deleted account holding a live session.
      if (!user) {
        req.session.destroy(() => undefined);
        next(AppError.unauthorized('Your session is no longer valid.'));
        return;
      }

      if (user.status === 'suspended') {
        // End the session rather than only refusing this request, so the
        // browser stops presenting a credential that will never work again.
        req.session.destroy(() => undefined);

        // 401, not 403: the session is gone, so the accurate state is
        // unauthenticated — and /auth/me sits behind this guard, where the
        // client treats 401 as signed out and 403 as an error screen. Signing
        // them out is the behaviour we want; the explanation arrives when they
        // try to sign back in, which already refuses a suspended account by
        // name.
        next(AppError.unauthorized('This account has been suspended.'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  })();
};
