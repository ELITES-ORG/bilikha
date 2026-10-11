import type { RequestHandler } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import type { IdDeclinedDetails } from '../contracts/verification.js';
import { db } from '../db/index.js';
import { idVerifications, users } from '../db/schema/index.js';
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

// Query strings and trailing slashes must not be a way around either list.
function pathOf(originalUrl: string): string {
  return originalUrl.split('?')[0]!.replace(/\/+$/, '');
}

function isAllowedWhileLocked(originalUrl: string): boolean {
  return ALLOWED_WHILE_LOCKED.includes(pathOf(originalUrl));
}

/**
 * What an account waiting on its ID may change: its password, and its ID
 * (ADR 0057). Everything else that writes answers VERIFICATION_PENDING; reading
 * is open, which is what "browse only" means. An allowlist for the same reason
 * as the one above, with the same cost when an endpoint is forgotten.
 */
const ALLOWED_WHILE_UNVERIFIED = [
  '/api/v1/me/password',
  '/api/v1/verification/upload-url',
  '/api/v1/verification/submission',
  // Private to the account and seen by nobody else, so not what browse-only
  // guards against: which side of the app it is looking at, and which of its
  // own notifications it has read.
  '/api/v1/me/view-mode',
  '/api/v1/notifications/read-all',
];

/** A notification marked read, by id: the same as read-all, one at a time. */
const NOTIFICATION_READ = /^\/api\/v1\/notifications\/[^/]+\/read$/;

function isAllowedWhileUnverified(originalUrl: string): boolean {
  const path = pathOf(originalUrl);
  return ALLOWED_WHILE_UNVERIFIED.includes(path) || NOTIFICATION_READ.test(path);
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Ends the session, then answers. Waiting matters here: the reason is told
 * once, and a request that raced ahead of the delete would be told again.
 */
function endWithDecline(
  req: Parameters<RequestHandler>[0],
  next: Parameters<RequestHandler>[2],
  details: IdDeclinedDetails,
): void {
  const error = idDeclined(details);
  req.session.destroy(() => next(error));
}

function idDeclined(details: IdDeclinedDetails): AppError {
  const message =
    details.kind === 'retry'
      ? 'Your ID could not be verified. Sign in to submit it again.'
      : details.kind === 'appealed'
        ? 'Your appeal is being reviewed.'
        : 'Your ID was declined, so this account cannot be used.';
  return new AppError(401, 'ID_DECLINED', message, details);
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
  /**
   * A decline rewrites the account's sessions in place (plan 0053 Step 3.2):
   * the user is removed and this notice added. Answered before the userId
   * check, which would otherwise answer first with a bare 401 — the browser
   * learns why it was signed out, once, and the session goes.
   */
  const notice = req.session.declineNotice;
  if (notice) {
    endWithDecline(req, next, { kind: notice.kind, reason: notice.reason });
    return;
  }

  const userId = req.session.userId;

  if (!userId) {
    next(AppError.unauthorized('You must be signed in.'));
    return;
  }

  void (async () => {
    try {
      // The account and its latest ID verification, in one query: this runs
      // on every authenticated request.
      const latest = db
        .select({ status: idVerifications.status, reason: idVerifications.decisionReason })
        .from(idVerifications)
        .where(eq(idVerifications.userId, users.id))
        .orderBy(desc(idVerifications.createdAt))
        .limit(1)
        .as('latest_id_verification');

      const [user] = await db
        .select({
          status: users.status,
          mustChangePassword: users.mustChangePassword,
          idStatus: latest.status,
          idReason: latest.reason,
        })
        .from(users)
        .leftJoinLateral(latest, sql`true`)
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

      // Not from Biliran, or an appeal against that still open: this account
      // cannot be used, so the session ends with the reason (ADR 0057).
      if (user.idStatus === 'declined_final' || user.idStatus === 'appealed') {
        endWithDecline(req, next, {
          kind: user.idStatus === 'appealed' ? 'appealed' : 'final',
          reason: user.idReason,
        });
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

      /**
       * Browse only while the ID waits for review, or after *try again* until it
       * is resubmitted (ADR 0057). No row at all — every account that existed
       * before this — is never gated. The request is looked at only when there
       * is a row to gate on.
       */
      if (
        (user.idStatus === 'pending' || user.idStatus === 'declined_retry')
        && !READ_METHODS.has(req.method)
        && !isAllowedWhileUnverified(req.originalUrl)
      ) {
        next(
          new AppError(
            403,
            'VERIFICATION_PENDING',
            'You can browse, but not do this until your ID is verified.',
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
