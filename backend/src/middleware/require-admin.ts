import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';

/**
 * Reads the role from the database on every request rather than caching it in
 * the session. Revoking an admin must take effect immediately, not whenever
 * their session happens to expire.
 *
 * Returns 404, not 403: the existence of an admin surface is not something an
 * ordinary user needs confirmed.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  void (async () => {
    if (!req.session.userId) {
      next(AppError.notFound('Not found'));
      return;
    }

    try {
      const [user] = await db
        .select({ role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);

      if (!user || user.role !== 'admin' || user.status === 'suspended') {
        next(AppError.notFound('Not found'));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  })();
};
