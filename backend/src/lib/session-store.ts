import { Store, type SessionData } from 'express-session';
import { eq, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions } from '../db/schema/index.js';
import { logger } from './logger.js';

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * express-session store backed by Drizzle. Written rather than pulled in so the
 * project keeps one Postgres driver and one connection pool — connect-pg-simple
 * would add the `pg` driver alongside postgres.js.
 */
export class DrizzleSessionStore extends Store {
  constructor() {
    super();
    const timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    // Do not hold the event loop open on shutdown.
    timer.unref();
  }

  private async prune(): Promise<void> {
    try {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    } catch (error) {
      logger.warn({ err: error }, 'Session prune failed');
    }
  }

  private expiryFor(session: SessionData): Date {
    const expires = session.cookie?.expires;
    if (expires) return new Date(expires);
    return new Date(Date.now() + (session.cookie?.maxAge ?? DEFAULT_TTL_MS));
  }

  override get(
    sid: string,
    callback: (err?: unknown, session?: SessionData | null) => void,
  ): void {
    void (async () => {
      try {
        const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid)).limit(1);

        if (!row) return callback(null, null);

        if (row.expiresAt.getTime() < Date.now()) {
          await db.delete(sessions).where(eq(sessions.sid, sid));
          return callback(null, null);
        }

        callback(null, JSON.parse(row.data) as SessionData);
      } catch (error) {
        callback(error);
      }
    })();
  }

  override set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        const values = {
          sid,
          data: JSON.stringify(session),
          expiresAt: this.expiryFor(session),
        };

        await db
          .insert(sessions)
          .values(values)
          .onConflictDoUpdate({
            target: sessions.sid,
            set: { data: values.data, expiresAt: values.expiresAt },
          });

        callback?.();
      } catch (error) {
        callback?.(error);
      }
    })();
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    void (async () => {
      try {
        await db.delete(sessions).where(eq(sessions.sid, sid));
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    })();
  }

  override touch(sid: string, session: SessionData, callback?: () => void): void {
    void (async () => {
      try {
        await db
          .update(sessions)
          .set({ expiresAt: this.expiryFor(session) })
          .where(eq(sessions.sid, sid));
      } catch (error) {
        logger.warn({ err: error }, 'Session touch failed');
      }
      callback?.();
    })();
  }
}
