import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { messageAttachments, messages, notifications } from '../../db/schema/index.js';
import { deleteObject } from '../../lib/storage.js';
import { makeConversation, makeCreative, makeUser } from '../../test/factories.js';
import { bucketFor } from '../media/media.limits.js';
import { loadAttachments } from './message-attachments.service.js';
import { deleteExpiredFiles, sendExpiryNotices } from './message-expiry.js';

/**
 * The message files sweep (ADR 0060, plan 0060 phase 5). Storage is mocked;
 * the test turns storage "on" itself, because the test setup turns it off
 * whatever this machine's .env holds.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return { ...actual, deleteObject: vi.fn() };
});

const remove = vi.mocked(deleteObject);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-20T08:00:00Z');
const saved = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  env.SUPABASE_URL = 'http://storage.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  remove.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  env.SUPABASE_URL = saved.url;
  env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  vi.restoreAllMocks();
});

/** A creative and a client in one conversation, and a message from the client. */
async function inConversation() {
  const creative = await makeCreative();
  const client = await makeUser();
  const conversation = await makeConversation(client.id, creative.profile);
  const [message] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, senderUserId: client.id, body: '' })
    .returning();
  return { creative, client, conversation, message: message! };
}

/** A video with its poster, expiring `expiresInMs` after NOW. */
async function video(messageId: string, conversationId: string, expiresInMs: number) {
  const [row] = await db
    .insert(messageAttachments)
    .values({
      messageId,
      kind: 'video',
      objectKey: `messages/${conversationId}/${randomUUID()}.mp4`,
      thumbKey: `messages/${conversationId}/${randomUUID()}-poster.webp`,
      mimeType: 'video/mp4',
      sizeBytes: 5_000_000,
      durationSeconds: 30,
      expiresAt: new Date(NOW.getTime() + expiresInMs),
    })
    .returning();
  return row!;
}

async function pdf(messageId: string, conversationId: string) {
  const [row] = await db
    .insert(messageAttachments)
    .values({
      messageId,
      kind: 'document',
      objectKey: `messages/${conversationId}/${randomUUID()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 500_000,
      expiresAt: null,
    })
    .returning();
  return row!;
}

async function reload(id: string) {
  const [row] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id));
  return row!;
}

async function noticesFor(userId: string) {
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

describe('deleting expired message files', () => {
  it('deletes an expired file and its poster, and leaves a file still in its 30 days and a PDF', async () => {
    const { conversation, message } = await inConversation();
    const expired = await video(message.id, conversation.id, -HOUR);
    const current = await video(message.id, conversation.id, DAY);
    const kept = await pdf(message.id, conversation.id);

    expect(await deleteExpiredFiles(NOW)).toBe(1);

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(expired.objectKey, bucketFor('video', 'message'));
    expect(remove).toHaveBeenCalledWith(expired.thumbKey, bucketFor('image', 'message'));
    expect((await reload(expired.id)).fileDeletedAt?.getTime()).toBe(NOW.getTime());
    expect((await reload(current.id)).fileDeletedAt).toBeNull();
    expect((await reload(kept.id)).fileDeletedAt).toBeNull();
  });

  it('is idempotent: a second run deletes nothing more, and the thread reads the same before and after', async () => {
    const { conversation, message } = await inConversation();
    await video(message.id, conversation.id, -HOUR);
    const before = await loadAttachments([message.id]);

    expect(await deleteExpiredFiles(NOW)).toBe(1);
    remove.mockClear();
    expect(await deleteExpiredFiles(NOW)).toBe(0);

    expect(remove).not.toHaveBeenCalled();
    expect(await loadAttachments([message.id])).toEqual(before);
    expect(before.get(message.id)?.[0]?.expired).toBe(true);
  });

  it('leaves a file whose delete failed unstamped, and the next run deletes it', async () => {
    const { conversation, message } = await inConversation();
    const expired = await video(message.id, conversation.id, -HOUR);
    remove.mockRejectedValueOnce(new Error('storage is down'));

    expect(await deleteExpiredFiles(NOW)).toBe(0);
    expect((await reload(expired.id)).fileDeletedAt).toBeNull();

    expect(await deleteExpiredFiles(new Date(NOW.getTime() + HOUR))).toBe(1);
    expect((await reload(expired.id)).fileDeletedAt).not.toBeNull();
  });

  it('does nothing when storage is not configured', async () => {
    const { conversation, message } = await inConversation();
    await video(message.id, conversation.id, -HOUR);
    env.SUPABASE_URL = undefined;

    expect(await deleteExpiredFiles(NOW)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('the three-day notice', () => {
  it('tells both people when a file expires within three days, and nobody earlier', async () => {
    const { creative, client, conversation, message } = await inConversation();
    await video(message.id, conversation.id, 2 * DAY);
    const other = await inConversation();
    await video(other.message.id, other.conversation.id, 4 * DAY);

    expect(await sendExpiryNotices(NOW)).toBe(2);

    for (const userId of [client.id, creative.user.id]) {
      const rows = await noticesFor(userId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'attachment_expiring', targetId: conversation.id });
    }
    expect(await noticesFor(other.client.id)).toEqual([]);
  });

  it('sends one notice per conversation, not one per file, and none again for files it covered', async () => {
    const { client, conversation, message } = await inConversation();
    await video(message.id, conversation.id, DAY);
    await video(message.id, conversation.id, 2 * DAY);

    expect(await sendExpiryNotices(NOW)).toBe(2);
    expect(await sendExpiryNotices(new Date(NOW.getTime() + HOUR))).toBe(0);
    expect(await sendExpiryNotices(new Date(NOW.getTime() + DAY))).toBe(0);
    expect(await noticesFor(client.id)).toHaveLength(1);
  });

  it('tells them about a file that comes due after a notice, but not within a day of it', async () => {
    const { client, conversation, message } = await inConversation();
    await video(message.id, conversation.id, 2 * DAY);
    await sendExpiryNotices(NOW);
    // Comes within three days of expiring two hours after the notice.
    await video(message.id, conversation.id, 3 * DAY + 2 * HOUR);

    expect(await sendExpiryNotices(new Date(NOW.getTime() + 3 * HOUR))).toBe(0);
    expect(await sendExpiryNotices(new Date(NOW.getTime() + DAY))).toBe(2);
    expect(await noticesFor(client.id)).toHaveLength(2);
  });

  it('says nothing about a file already deleted or already expired', async () => {
    const { client, conversation, message } = await inConversation();
    const deleted = await video(message.id, conversation.id, 2 * DAY);
    await db.update(messageAttachments).set({ fileDeletedAt: NOW }).where(eq(messageAttachments.id, deleted.id));
    await video(message.id, conversation.id, -HOUR);

    expect(await sendExpiryNotices(NOW)).toBe(0);
    expect(await noticesFor(client.id)).toEqual([]);
  });
});
