import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ConversationAttachment, ConversationAttachmentUrl } from '../../contracts/conversations.js';
import { db } from '../../db/index.js';
import { messageAttachments, messages } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import { SIGNED_DOWNLOAD_MAX_SECONDS, createSignedDownload } from '../../lib/storage.js';
import { bucketFor, messageFileExpiry } from '../media/media.limits.js';
import { consumeReservation, verifyReservation, type VerifiedUpload } from '../media/media.service.js';

/**
 * Files sent in a message (ADR 0060). The thread says what each file is and
 * never where it is; a participant asks for a short signed URL when the file is
 * about to be shown or played. Callers resolve the conversation and check the
 * caller is in it first.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AttachmentVariant = 'file' | 'thumb';

function isExpired(row: { expiresAt: Date | null; fileDeletedAt: Date | null }, now: Date): boolean {
  return row.fileDeletedAt !== null || (row.expiresAt !== null && row.expiresAt <= now);
}

/** Each message's files, keyed by message id, in a stable order. */
export async function loadAttachments(messageIds: string[]): Promise<Map<string, ConversationAttachment[]>> {
  const byMessage = new Map<string, ConversationAttachment[]>();
  if (messageIds.length === 0) return byMessage;

  const rows = await db
    .select()
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, messageIds))
    .orderBy(asc(messageAttachments.createdAt), asc(messageAttachments.id));

  const now = new Date();
  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      kind: row.kind,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      durationSeconds: row.durationSeconds,
      hasThumb: row.thumbKey !== null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      expired: isExpired(row, now),
    });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

/**
 * Checks each ticket against what storage holds, before the message is
 * written. Runs outside the message's transaction: a failed check deletes the
 * upload, and that must stick even though the message is not sent.
 */
export async function verifyMessageUploads(
  userId: string,
  conversationId: string,
  reservationIds: string[],
): Promise<VerifiedUpload[]> {
  const verified: VerifiedUpload[] = [];
  for (const reservationId of reservationIds) {
    const upload = await verifyReservation(userId, reservationId);
    if (upload.destination !== 'message' || upload.conversationId !== conversationId) {
      throw AppError.conflict('That upload belongs to a different conversation.');
    }
    verified.push(upload);
  }
  return verified;
}

/** Writes the files and consumes their tickets, inside the message's transaction. */
export async function recordAttachments(
  tx: Tx,
  messageId: string,
  uploads: VerifiedUpload[],
  sentAt: Date,
): Promise<void> {
  for (const upload of uploads) {
    await tx.insert(messageAttachments).values({
      messageId,
      kind: upload.kind,
      objectKey: upload.objectKey,
      thumbKey: upload.thumbKey,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      durationSeconds: upload.durationSeconds,
      expiresAt: messageFileExpiry(upload.kind, sentAt),
      createdAt: sentAt,
    });
    await consumeReservation(tx, upload.reservationId);
  }
}

/**
 * A URL that reads one file or its thumbnail for at most five minutes, and
 * never past the file's expiry. Expiry is decided here, on read: from
 * `expires_at` on no URL is issued, whether or not the sweep has run.
 */
export async function signAttachment(
  conversationId: string,
  attachmentId: string,
  variant: AttachmentVariant,
): Promise<ConversationAttachmentUrl> {
  const [row] = await db
    .select({
      kind: messageAttachments.kind,
      objectKey: messageAttachments.objectKey,
      thumbKey: messageAttachments.thumbKey,
      expiresAt: messageAttachments.expiresAt,
      fileDeletedAt: messageAttachments.fileDeletedAt,
    })
    .from(messageAttachments)
    .innerJoin(messages, eq(messageAttachments.messageId, messages.id))
    .where(and(eq(messageAttachments.id, attachmentId), eq(messages.conversationId, conversationId)))
    .limit(1);

  const key = variant === 'thumb' ? row?.thumbKey : row?.objectKey;
  if (!row || !key) throw AppError.notFound('No such file.');

  const now = new Date();
  const secondsLeft = row.expiresAt
    ? Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000)
    : SIGNED_DOWNLOAD_MAX_SECONDS;
  if (isExpired(row, now) || secondsLeft < 1) {
    throw new AppError(410, 'ATTACHMENT_EXPIRED', 'This file is no longer available.', {
      expiredAt: row.expiresAt?.toISOString() ?? null,
    });
  }

  const seconds = Math.min(SIGNED_DOWNLOAD_MAX_SECONDS, secondsLeft);
  const bucket = variant === 'thumb' ? bucketFor('image', 'message') : bucketFor(row.kind, 'message');
  const url = await createSignedDownload(bucket, key, seconds);
  return { url, expiresAt: new Date(now.getTime() + seconds * 1000).toISOString() };
}
