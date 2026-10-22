import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, max } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { conversations, messageAttachments, messages, notifications } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { deleteObject, isStorageConfigured } from '../../lib/storage.js';
import { bucketFor } from '../media/media.limits.js';
import { notify } from '../notifications/notifications.service.js';

/**
 * The message files sweep (ADR 0060, plan 0060 phase 5). Photos, audio and
 * video stop opening at `expires_at` whatever this does: the API issues no URL
 * past it. What this does is delete the stored objects, stamp
 * `file_deleted_at`, and tell both people three days before a file goes.
 *
 * Best-effort and idempotent. Every error is caught and logged by row, and the
 * next hour tries again: a late or repeated run changes nothing a reader sees.
 */

/** Files per pass. The next hour picks up what one pass leaves. */
const BATCH = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FIRST_RUN_DELAY_MS = 60 * 1000;

/** How long before a file expires both people are told. */
export const EXPIRY_NOTICE_MS = 3 * DAY_MS;

/**
 * Deletes the objects of files expired by `now`, then stamps the row. The
 * stamp comes after the delete, so a file whose delete failed is tried again
 * next hour; a missing object counts as deleted. Returns the files stamped.
 */
export async function deleteExpiredFiles(now: Date = new Date()): Promise<number> {
  if (!isStorageConfigured()) return 0;

  let rows: Pick<typeof messageAttachments.$inferSelect, 'id' | 'kind' | 'objectKey' | 'thumbKey'>[];
  try {
    rows = await db
      .select({
        id: messageAttachments.id,
        kind: messageAttachments.kind,
        objectKey: messageAttachments.objectKey,
        thumbKey: messageAttachments.thumbKey,
      })
      .from(messageAttachments)
      .where(
        and(
          isNull(messageAttachments.fileDeletedAt),
          isNotNull(messageAttachments.expiresAt),
          lte(messageAttachments.expiresAt, now),
        ),
      )
      .orderBy(asc(messageAttachments.expiresAt))
      .limit(BATCH);
  } catch (error) {
    logger.error({ err: error }, 'Message expiry: could not find expired files');
    return 0;
  }

  let deleted = 0;
  for (const row of rows) {
    try {
      await deleteObject(row.objectKey, bucketFor(row.kind, 'message'));
      if (row.thumbKey) await deleteObject(row.thumbKey, bucketFor('image', 'message'));
      await db
        .update(messageAttachments)
        .set({ fileDeletedAt: now })
        .where(and(eq(messageAttachments.id, row.id), isNull(messageAttachments.fileDeletedAt)));
      deleted += 1;
    } catch (error) {
      logger.error(
        { err: error, attachmentId: row.id },
        'Message expiry: could not delete a file; the next run tries again',
      );
    }
  }
  return deleted;
}

/**
 * Tells both people in a conversation that a photo, audio or video in it
 * expires within three days: at most one notice per person per conversation
 * per day, and none for a file an earlier notice already covered. Returns the
 * notices sent.
 */
export async function sendExpiryNotices(now: Date = new Date()): Promise<number> {
  let due: { conversationId: string; clientUserId: string; creativeUserId: string; latest: Date | null }[];
  let sent: { userId: string; conversationId: string; last: Date | null }[];
  try {
    due = await db
      .select({
        conversationId: conversations.id,
        clientUserId: conversations.clientUserId,
        creativeUserId: conversations.creativeUserId,
        latest: max(messageAttachments.expiresAt),
      })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          isNull(messageAttachments.fileDeletedAt),
          gt(messageAttachments.expiresAt, now),
          lte(messageAttachments.expiresAt, new Date(now.getTime() + EXPIRY_NOTICE_MS)),
        ),
      )
      .groupBy(conversations.id);
    if (due.length === 0) return 0;

    sent = await db
      .select({
        userId: notifications.userId,
        conversationId: notifications.targetId,
        last: max(notifications.createdAt),
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.type, 'attachment_expiring'),
          inArray(
            notifications.targetId,
            due.map((row) => row.conversationId),
          ),
        ),
      )
      .groupBy(notifications.userId, notifications.targetId);
  } catch (error) {
    logger.error({ err: error }, 'Message expiry: could not find files about to expire');
    return 0;
  }

  const lastNotice = new Map(sent.map((row) => [`${row.conversationId}:${row.userId}`, row.last]));
  let notices = 0;
  for (const row of due) {
    if (!row.latest) continue;
    // The newest file to come within three days of expiring did so here.
    const windowOpened = row.latest.getTime() - EXPIRY_NOTICE_MS;
    for (const userId of [row.clientUserId, row.creativeUserId]) {
      const last = lastNotice.get(`${row.conversationId}:${userId}`);
      if (last && (now.getTime() - last.getTime() < DAY_MS || last.getTime() >= windowOpened)) continue;
      await notify({ userId, type: 'attachment_expiring', targetId: row.conversationId, at: now });
      notices += 1;
    }
  }
  return notices;
}

export async function runMessageExpiry(now: Date = new Date()): Promise<{ deleted: number; notices: number }> {
  const deleted = await deleteExpiredFiles(now);
  const notices = await sendExpiryNotices(now);
  if (deleted > 0 || notices > 0) {
    logger.info({ deleted, notices }, 'Message expiry: files deleted and notices sent');
  }
  return { deleted, notices };
}

/**
 * Hourly in the API process, and once a minute after start, beside the ID
 * retention pass (ADR 0060). Called from `index.ts` only — never from
 * `createApp`, so tests and scripts that build the app never start it. The
 * timers do not hold the process open.
 */
export function startMessageExpiry(): void {
  if (!isStorageConfigured()) return;
  const run = () => void runMessageExpiry();
  setTimeout(run, FIRST_RUN_DELAY_MS).unref();
  setInterval(run, HOUR_MS).unref();
}
