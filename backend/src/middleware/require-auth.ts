import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';

/**
 * The only two things an account with a forced password change may reach: read
 * its own session, and replace the password.
 *
 * This is an allowlist, which means it rots — a future endpoint that a
 * locked-out account legitimately needs will have to be added here, and the
 * symptom of forgetting is a 403 nobody can explain. It lives next to the
 * check for that reason. Matched on `originalUrl`, because `req.path` is
 * relative to whichever router mounted this guard.
 */
const ALLOWED_WHILE_LOCKED = ['/api/v1/auth/me', '/api/v1/me/password'];

function isAllowedWhileLocked(originalUrl: string): boolean {
  // Query strings and trailing slashes must not be a way around it.
  const path = originalUrl.split('?')[0]!.replace(/\/+$/, '');
  return ALLOWED_WHILE_LOCKED.includes(path);
}

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
        .select({ status: users.status, mustChangePassword: users.mustChangePassword })
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

      /**
       * An administrator issued a temporary password (ADR 0051). The session is
       * valid, so this is a 403 and not a 401 — the account is signed in and
       * simply may not do anything else yet.
       *
       * Enforced here rather than by redirecting in the router: a frontend
       * route guard is a courtesy, and the case that matters is somebody
       * holding a temporary password and curl.
       */
      if (user.mustChangePassword && !isAllowedWhileLocked(req.originalUrl)) {
        next(
          new AppError(
            403,
            'PASSWORD_CHANGE_REQUIRED',
            'Set a new password before continuing.',
          ),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  })();
};
