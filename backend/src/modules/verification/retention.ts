import { and, asc, eq, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { idVerifications } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { deleteObject, isStorageConfigured, listObjects } from '../../lib/storage.js';
import { storageBelongsToDatabase } from '../../lib/storage-safety.js';
import { DECISION_WINDOW_MS } from './review.service.js';

/**
 * Deleting ID photos (ADR 0057, plan 0053 Step 3.3). A government ID is held
 * for days, not kept: the images go 7 days after the latest decision, and
 * anything in the ID bucket that no row points at goes after a day.
 *
 * Reading is protected separately — no signed URL is issued past the 7 days —
 * so a late sweep never makes an ID readable for longer. What this does is keep
 * the bucket from holding what it no longer needs.
 *
 * Both passes catch and log every error by row, never by object key, and carry
 * on: one stuck object must not stop the rest being deleted.
 */

/** Rows per pass. The next hour picks up what one pass leaves. */
const BATCH = 100;

/** An upload never submitted is abandoned after this long. */
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

/**
 * Deletes the images of rows decided at least 7 days before `now`, then clears
 * their keys and stamps `images_deleted_at`. An open appeal keeps its ID: the
 * appeal is decided on those photos.
 */
export async function purgeDecidedIdImages(now: Date = new Date()): Promise<number> {
  if (!isStorageConfigured()) return 0;

  let rows: { id: string; frontKey: string | null; backKey: string | null }[];
  try {
    rows = await db
      .select({ id: idVerifications.id, frontKey: idVerifications.frontKey, backKey: idVerifications.backKey })
      .from(idVerifications)
      .where(
        and(
          isNull(idVerifications.imagesDeletedAt),
          isNotNull(idVerifications.decidedAt),
          lte(idVerifications.decidedAt, new Date(now.getTime() - DECISION_WINDOW_MS)),
          ne(idVerifications.status, 'appealed'),
          or(isNotNull(idVerifications.frontKey), isNotNull(idVerifications.backKey)),
        ),
      )
      .orderBy(asc(idVerifications.decidedAt))
      .limit(BATCH);
  } catch (error) {
    logger.error({ err: error }, 'ID retention: could not find decided rows');
    return 0;
  }

  let purged = 0;
  for (const row of rows) {
    try {
      for (const key of [row.frontKey, row.backKey]) {
        // A missing object is already gone: deleteObject treats it as success.
        if (key) await deleteObject(key, env.SUPABASE_ID_BUCKET);
      }
      await db
        .update(idVerifications)
        .set({ frontKey: null, backKey: null, imagesDeletedAt: now, updatedAt: now })
        .where(and(eq(idVerifications.id, row.id), isNull(idVerifications.imagesDeletedAt)));
      purged += 1;
    } catch (error) {
      logger.error({ err: error, idVerificationId: row.id }, 'ID retention: could not delete images');
    }
  }
  return purged;
}

/**
 * Deletes ID objects older than a day that no row points at: uploads never
 * submitted, and photos whose row went with a deleted account.
 *
 * Only where the database and the bucket are the same environment. A local
 * database against a hosted bucket would see every real ID as an orphan.
 */
export async function purgeOrphanIdObjects(now: Date = new Date()): Promise<number> {
  if (!isStorageConfigured() || !storageBelongsToDatabase()) return 0;

  try {
    const [objects, referenced] = await Promise.all([
      listObjects('ids/', env.SUPABASE_ID_BUCKET),
      db
        .select({ frontKey: idVerifications.frontKey, backKey: idVerifications.backKey })
        .from(idVerifications)
        .where(or(isNotNull(idVerifications.frontKey), isNotNull(idVerifications.backKey))),
    ]);
    const keep = new Set(referenced.flatMap((row) => [row.frontKey, row.backKey]).filter(Boolean));

    let purged = 0;
    for (const object of objects) {
      if (keep.has(object.name)) continue;
      // No timestamp is not proof of age: keep it for another pass.
      if (!object.updatedAt) continue;
      if (now.getTime() - new Date(object.updatedAt).getTime() < ORPHAN_AGE_MS) continue;
      try {
        await deleteObject(object.name, env.SUPABASE_ID_BUCKET);
        purged += 1;
      } catch (error) {
        logger.error({ err: error }, 'ID retention: could not delete an unreferenced ID object');
      }
    }
    return purged;
  } catch (error) {
    logger.error({ err: error }, 'ID retention: could not list the ID bucket');
    return 0;
  }
}

export async function runIdRetention(now: Date = new Date()): Promise<{ decided: number; orphans: number }> {
  const decided = await purgeDecidedIdImages(now);
  const orphans = await purgeOrphanIdObjects(now);
  if (decided > 0 || orphans > 0) {
    logger.info({ decided, orphans }, 'ID retention: images deleted');
  }
  return { decided, orphans };
}

/**
 * Hourly in the API process, and once a minute after start (ADR 0057). Called
 * from `index.ts` only — never from `createApp`, so tests and scripts that
 * build the app never start it. The timers do not hold the process open.
 */
export function startIdRetention(): void {
  if (!isStorageConfigured()) return;
  if (!storageBelongsToDatabase()) {
    logger.warn(
      'ID retention: the database is local but storage is a hosted project, so unreferenced ID objects are left alone. Decided rows are still purged.',
    );
  }
  const run = () => void runIdRetention();
  setTimeout(run, FIRST_RUN_DELAY_MS).unref();
  setInterval(run, HOUR_MS).unref();
}
