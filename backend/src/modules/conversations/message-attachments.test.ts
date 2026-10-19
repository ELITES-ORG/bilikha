import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db } from '../../db/index.js';
import { mediaUploads, messageAttachments, messages } from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { createSignedDownload, discardObject, readFirstBytes, storedObject } from '../../lib/storage.js';
import { makeConversation, makeCreative, makeUser, PASSWORD } from '../../test/factories.js';
import { MB, MESSAGE_FILE_LIFETIME_MS } from '../media/media.limits.js';
import { sendMessageSchema } from './conversations.schema.js';
import { attachmentUrl, getThread, listThreads, sendMessage } from './conversations.service.js';

/**
 * Files in messages (ADR 0060, plan 0060 phase 3). Storage is mocked: what is
 * under test is which tickets become files, what the thread says about them,
 * and when a URL is issued.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return {
    ...actual,
    storedObject: vi.fn(),
    readFirstBytes: vi.fn(),
    discardObject: vi.fn(),
    createSignedDownload: vi.fn(),
  };
});

const stored = vi.mocked(storedObject);
const firstBytes = vi.mocked(readFirstBytes);
const discard = vi.mocked(discardObject);
const signDownload = vi.mocked(createSignedDownload);

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

/** Objects storage holds, by `bucket/key`. */
let objects: Map<string, { size: number; mimetype: string }>;

function put(bucket: string, key: string, size: number, mimetype: string) {
  objects.set(`${bucket}/${key}`, { size, mimetype });
}

beforeEach(() => {
  objects = new Map();
  stored.mockReset().mockImplementation(async (bucket, key) => {
    const found = objects.get(`${bucket}/${key}`);
    return found ? { name: key, updatedAt: new Date().toISOString(), ...found } : null;
  });
  firstBytes.mockReset().mockImplementation(async (bucket, key) =>
    objects.get(`${bucket}/${key}`)?.mimetype === 'application/pdf' ? PDF : WEBP,
  );
  discard.mockReset().mockResolvedValue(undefined);
  signDownload
    .mockReset()
    .mockImplementation(async (bucket, key, seconds) => `https://storage.test/sign/${bucket}/${key}?s=${seconds}`);
});

/** A creative and a client in one conversation. */
async function inConversation() {
  const creative = await makeCreative({ user: { passwordHash: await hashPassword(PASSWORD) } });
  const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
  const conversation = await makeConversation(client.id, creative.profile);
  return { creative, client, conversation };
}

/** A message ticket whose PDF is already in storage, as the browser leaves it. */
async function uploadedPdf(userId: string, conversationId: string, size = 500_000) {
  const objectKey = `messages/${conversationId}/${randomUUID()}.pdf`;
  const [row] = await db
    .insert(mediaUploads)
    .values({
      userId,
      destination: 'message',
      conversationId,
      kind: 'document',
      bucket: 'media-messages-documents',
      objectKey,
      mimeType: 'application/pdf',
      sizeBytes: 500_000,
      reservedBytes: 10 * MB,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning();
  put('media-messages-documents', objectKey, size, 'application/pdf');
  return row!;
}

/** A message ticket whose photo and thumbnail are already in storage. */
async function uploadedPhoto(userId: string, conversationId: string) {
  const base = `messages/${conversationId}/${randomUUID()}`;
  const [row] = await db
    .insert(mediaUploads)
    .values({
      userId,
      destination: 'message',
      conversationId,
      kind: 'image',
      bucket: 'media-messages',
      objectKey: `${base}.webp`,
      thumbKey: `${base}-thumb.webp`,
      mimeType: 'image/webp',
      sizeBytes: 300_000,
      thumbSizeBytes: 30_000,
      reservedBytes: 4 * MB,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning();
  put('media-messages', `${base}.webp`, 300_000, 'image/webp');
  put('media-messages', `${base}-thumb.webp`, 30_000, 'image/webp');
  return row!;
}

const send = (conversationId: string, userId: string, body: Record<string, unknown>) =>
  sendMessage(conversationId, userId, sendMessageSchema.parse(body));

async function reservationCount(userId: string) {
  return (await db.select().from(mediaUploads).where(eq(mediaUploads.userId, userId))).length;
}

async function messageCount(conversationId: string) {
  return (await db.select().from(messages).where(eq(messages.conversationId, conversationId))).length;
}

/** An attachment written directly, for the read tests. */
async function sentFile(
  conversationId: string,
  senderUserId: string,
  overrides: Partial<typeof messageAttachments.$inferInsert> = {},
) {
  const [message] = await db
    .insert(messages)
    .values({ conversationId, senderUserId, body: '' })
    .returning();
  const base = `messages/${conversationId}/${randomUUID()}`;
  const [row] = await db
    .insert(messageAttachments)
    .values({
      messageId: message!.id,
      kind: 'image',
      objectKey: `${base}.webp`,
      thumbKey: `${base}-thumb.webp`,
      mimeType: 'image/webp',
      sizeBytes: 330_000,
      expiresAt: new Date(Date.now() + MESSAGE_FILE_LIFETIME_MS),
      ...overrides,
    })
    .returning();
  return row!;
}

describe('sending files', () => {
  it('sends files with no text, writes them with their expiry, and spends the tickets', async () => {
    const { client, conversation } = await inConversation();
    const photo = await uploadedPhoto(client.id, conversation.id);
    const pdf = await uploadedPdf(client.id, conversation.id);

    const sent = await send(conversation.id, client.id, { attachments: [photo.id, pdf.id] });

    expect(sent.body).toBe('');
    expect(sent.attachments.map((file) => file.kind).sort()).toEqual(['document', 'image']);
    const rows = await db.select().from(messageAttachments).where(eq(messageAttachments.messageId, sent.id));
    const image = rows.find((row) => row.kind === 'image')!;
    const document = rows.find((row) => row.kind === 'document')!;
    expect(image).toMatchObject({ objectKey: photo.objectKey, thumbKey: photo.thumbKey, sizeBytes: 330_000 });
    expect(image.expiresAt!.getTime() - image.createdAt.getTime()).toBe(MESSAGE_FILE_LIFETIME_MS);
    expect(document).toMatchObject({ objectKey: pdf.objectKey, thumbKey: null, expiresAt: null });
    expect(await reservationCount(client.id)).toBe(0);
  });

  it('refuses an empty message, a sixth file and the same file twice before anything is checked', () => {
    const ids = Array.from({ length: 6 }, () => randomUUID());

    expect(sendMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ attachments: ids }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ attachments: [ids[0], ids[0]] }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: 'Hello' }).data).toMatchObject({ attachments: [] });
  });

  it('refuses a ticket for another conversation, and one that is not the caller’s, sending nothing', async () => {
    const { creative, client, conversation } = await inConversation();
    const elsewhere = await makeConversation(client.id, (await makeCreative()).profile);
    const misplaced = await uploadedPdf(client.id, elsewhere.id);
    const theirs = await uploadedPdf(creative.user.id, conversation.id);

    await expect(send(conversation.id, client.id, { attachments: [misplaced.id] })).rejects.toMatchObject({
      status: 409,
      message: 'That upload belongs to a different conversation.',
    });
    await expect(send(conversation.id, client.id, { attachments: [theirs.id] })).rejects.toMatchObject({
      status: 410,
      code: 'MEDIA_UPLOAD_EXPIRED',
    });
    expect(await messageCount(conversation.id)).toBe(0);
    expect(await reservationCount(client.id)).toBe(1);
    expect(await reservationCount(creative.user.id)).toBe(1);
  });

  it('deletes a forged file on verify, and sends neither it nor the files beside it', async () => {
    const { client, conversation } = await inConversation();
    const good = await uploadedPhoto(client.id, conversation.id);
    const forged = await uploadedPdf(client.id, conversation.id, 9_000_000);

    await expect(
      send(conversation.id, client.id, { body: 'The quote', attachments: [good.id, forged.id] }),
    ).rejects.toMatchObject({ status: 422, code: 'MEDIA_VERIFICATION_FAILED', details: { reason: 'size' } });

    expect(await messageCount(conversation.id)).toBe(0);
    expect(discard).toHaveBeenCalledWith(forged.objectKey, 'media-messages-documents');
    const left = await db.select().from(mediaUploads).where(eq(mediaUploads.userId, client.id));
    expect(left.map((row) => row.id)).toEqual([good.id]);
  });

  it('deletes a file whose stored type is not the one its ticket declared, sending nothing', async () => {
    const { client, conversation } = await inConversation();
    const relabelled = await uploadedPdf(client.id, conversation.id);
    put('media-messages-documents', relabelled.objectKey, 500_000, 'text/html');

    await expect(send(conversation.id, client.id, { attachments: [relabelled.id] })).rejects.toMatchObject({
      status: 422,
      code: 'MEDIA_VERIFICATION_FAILED',
      details: { reason: 'type' },
    });

    expect(await messageCount(conversation.id)).toBe(0);
    expect(discard).toHaveBeenCalledWith(relabelled.objectKey, 'media-messages-documents');
    expect(await reservationCount(client.id)).toBe(0);
  });

  it('sends a ticket once when two sends race for it, refusing the second with 410', async () => {
    const { client, conversation } = await inConversation();
    const pdf = await uploadedPdf(client.id, conversation.id);
    // Hold each check at storage until both have arrived, so both reach the write.
    let arrived = 0;
    let release!: () => void;
    const bothChecking = new Promise<void>((resolve) => {
      release = resolve;
    });
    const look = stored.getMockImplementation()!;
    stored.mockImplementation(async (bucket, key) => {
      arrived += 1;
      if (arrived === 2) release();
      await bothChecking;
      return look(bucket, key);
    });

    const results = await Promise.allSettled([
      send(conversation.id, client.id, { attachments: [pdf.id] }),
      send(conversation.id, client.id, { attachments: [pdf.id] }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(refused?.reason).toMatchObject({ status: 410, code: 'MEDIA_UPLOAD_EXPIRED' });
    expect(await messageCount(conversation.id)).toBe(1);
  });
});

describe('what the thread says', () => {
  it('describes each file and carries no URL or storage key anywhere', async () => {
    const { creative, client, conversation } = await inConversation();
    const photo = await uploadedPhoto(client.id, conversation.id);
    await send(conversation.id, client.id, { body: 'Like this', attachments: [photo.id] });

    const thread = await getThread(conversation.id, creative.user.id, { limit: 50 });

    const [message] = thread.messages;
    expect(message!.attachments).toEqual([
      {
        id: expect.any(String),
        kind: 'image',
        mimeType: 'image/webp',
        sizeBytes: 330_000,
        durationSeconds: null,
        hasThumb: true,
        expiresAt: expect.any(String),
        expired: false,
      },
    ]);
    const json = JSON.stringify(thread);
    expect(json).not.toContain('storage.test');
    expect(json).not.toContain(photo.objectKey);
    expect(signDownload).not.toHaveBeenCalled();
  });

  it('marks a file expired from expires_at on, before any sweep', async () => {
    const { client, conversation } = await inConversation();
    await sentFile(conversation.id, client.id, { expiresAt: new Date(Date.now() - 1000) });

    const thread = await getThread(conversation.id, client.id, { limit: 50 });

    expect(thread.messages[0]!.attachments[0]).toMatchObject({ expired: true });
  });

  it("names the kinds of file on the list's last message, so one with no text can be described", async () => {
    const { creative, client, conversation } = await inConversation();
    const photo = await uploadedPhoto(client.id, conversation.id);
    const pdf = await uploadedPdf(client.id, conversation.id);
    await send(conversation.id, client.id, { attachments: [photo.id, pdf.id] });

    const list = await listThreads(creative.user.id, { mode: 'creative', page: 1, limit: 20 });

    const row = list.data.find((item) => item.id === conversation.id)!;
    expect(row.lastMessage).toMatchObject({ body: '', fromSelf: false });
    expect(row.lastMessage!.attachmentKinds.sort()).toEqual(['document', 'image']);
  });
});

describe('signed reads', () => {
  it('signs a file or its thumbnail for five minutes, in the private message buckets', async () => {
    const { creative, client, conversation } = await inConversation();
    const pdf = await sentFile(conversation.id, client.id, {
      kind: 'document',
      objectKey: `messages/${conversation.id}/quote.pdf`,
      thumbKey: null,
      mimeType: 'application/pdf',
      expiresAt: null,
    });
    const photo = await sentFile(conversation.id, client.id);

    const file = await attachmentUrl(conversation.id, pdf.id, creative.user.id, { variant: 'file' });
    const thumb = await attachmentUrl(conversation.id, photo.id, client.id, { variant: 'thumb' });

    expect(signDownload).toHaveBeenCalledWith('media-messages-documents', pdf.objectKey, 300);
    expect(signDownload).toHaveBeenCalledWith('media-messages', photo.thumbKey, 300);
    expect(file.url).toContain('/media-messages-documents/');
    expect(new Date(thumb.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(300_000);
  });

  it('never signs past the file’s own expiry', async () => {
    const { client, conversation } = await inConversation();
    const photo = await sentFile(conversation.id, client.id, { expiresAt: new Date(Date.now() + 120_000) });

    const result = await attachmentUrl(conversation.id, photo.id, client.id, { variant: 'file' });

    const seconds = signDownload.mock.calls[0]![2];
    expect(seconds).toBeGreaterThanOrEqual(118);
    expect(seconds).toBeLessThanOrEqual(120);
    expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(photo.expiresAt!.getTime());
  });

  it('answers 410 for an expired file even before the sweep, and once the sweep has run', async () => {
    const { client, conversation } = await inConversation();
    const lapsed = await sentFile(conversation.id, client.id, { expiresAt: new Date(Date.now() - 1000) });
    const swept = await sentFile(conversation.id, client.id, { fileDeletedAt: new Date() });

    for (const file of [lapsed, swept]) {
      await expect(attachmentUrl(conversation.id, file.id, client.id, { variant: 'file' })).rejects.toMatchObject({
        status: 410,
        code: 'ATTACHMENT_EXPIRED',
      });
    }
    expect(signDownload).not.toHaveBeenCalled();
  });

  it('keeps a PDF readable whenever it was sent', async () => {
    const { client, conversation } = await inConversation();
    const old = new Date(Date.now() - 2 * MESSAGE_FILE_LIFETIME_MS);
    const pdf = await sentFile(conversation.id, client.id, {
      kind: 'document',
      objectKey: `messages/${conversation.id}/old.pdf`,
      thumbKey: null,
      mimeType: 'application/pdf',
      expiresAt: null,
      createdAt: old,
    });

    await expect(attachmentUrl(conversation.id, pdf.id, client.id, { variant: 'file' })).resolves.toMatchObject({
      url: expect.stringContaining('old.pdf'),
    });
  });

  it('answers 404 to a non-participant, for a file of another conversation, and for a thumbnail a file lacks', async () => {
    const { client, conversation } = await inConversation();
    const outsider = await makeUser();
    const elsewhere = await makeConversation(client.id, (await makeCreative()).profile);
    const photo = await sentFile(conversation.id, client.id);
    const pdf = await sentFile(conversation.id, client.id, { kind: 'document', thumbKey: null, expiresAt: null });

    await expect(attachmentUrl(conversation.id, photo.id, outsider.id, { variant: 'file' })).rejects.toMatchObject({
      status: 404,
      message: 'No such conversation.',
    });
    await expect(attachmentUrl(elsewhere.id, photo.id, client.id, { variant: 'file' })).rejects.toMatchObject({
      status: 404,
      message: 'No such file.',
    });
    await expect(attachmentUrl(conversation.id, pdf.id, client.id, { variant: 'thumb' })).rejects.toMatchObject({
      status: 404,
      message: 'No such file.',
    });
  });
});

describe('GET /api/v1/conversations/:id/attachments/:attachmentId/url', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  it('answers a participant with { url, expiresAt }, and refuses a bad variant', async () => {
    const { client, conversation } = await inConversation();
    const photo = await sentFile(conversation.id, client.id);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: client.username, password: PASSWORD }),
    });
    await login.text();
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const path = `${base}/conversations/${conversation.id}/attachments/${photo.id}/url`;

    const ok = await fetch(`${path}?variant=thumb`, { headers: { cookie } });
    const bad = await fetch(`${path}?variant=poster`, { headers: { cookie } });

    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: unknown }).data).toEqual({
      url: expect.stringContaining(photo.thumbKey!),
      expiresAt: expect.any(String),
    });
    expect(bad.status).toBe(400);
    await bad.text();
  });
});
