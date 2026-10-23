import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { creativeProfiles, mediaUploads, offerImages, userBlocks, users } from '../../db/schema/index.js';
import type { MediaLimits, UploadTicket } from '../../contracts/media.js';
import { hashPassword } from '../../lib/password.js';
import {
  createSignedUpload,
  deleteObject,
  discardObject,
  readFirstBytes,
  storedObject,
  type StoredObject,
} from '../../lib/storage.js';
import { makeConversation, makeCreative, makeOffer, makeUser, PASSWORD, suspend } from '../../test/factories.js';
import { verifyReservation } from './media.service.js';

/**
 * Storage is mocked: route tests never stub `fetch`, they call the app with it
 * (plan 0053 rules). The key builders and `tusEndpoint` stay real, because what
 * is under test is which keys and buckets a ticket names.
 */
vi.mock('../../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage.js')>();
  return {
    ...actual,
    createSignedUpload: vi.fn(),
    storedObject: vi.fn(),
    readFirstBytes: vi.fn(),
    discardObject: vi.fn(),
    deleteObject: vi.fn(),
  };
});

const signUpload = vi.mocked(createSignedUpload);
const stored = vi.mocked(storedObject);
const firstBytes = vi.mocked(readFirstBytes);
const discard = vi.mocked(discardObject);
const remove = vi.mocked(deleteObject);

const MB = 1_000_000;
const ID3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const original = {
  url: env.SUPABASE_URL,
  key: env.SUPABASE_SERVICE_ROLE_KEY,
  kinds: env.MEDIA_UPLOAD_KINDS,
  messageAttachments: env.MESSAGE_ATTACHMENTS,
};

type ApiReply = {
  status: number;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

describe('/api/v1/media upload pipeline', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    env.SUPABASE_URL = 'http://storage.test';
    env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
    env.MEDIA_UPLOAD_KINDS = ['audio', 'video', 'document'];
    env.MESSAGE_ATTACHMENTS = true;
    signUpload.mockReset().mockImplementation(async (objectKey: string, bucket?: string) => ({
      uploadUrl: `http://storage.test/upload/${bucket}/${objectKey}?token=t`,
      objectKey,
      token: 't',
    }));
    stored.mockReset().mockResolvedValue(null);
    firstBytes.mockReset().mockResolvedValue(new Uint8Array());
    discard.mockReset().mockResolvedValue(undefined);
    remove.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    env.SUPABASE_URL = original.url;
    env.SUPABASE_SERVICE_ROLE_KEY = original.key;
    env.MEDIA_UPLOAD_KINDS = original.kinds;
    env.MESSAGE_ATTACHMENTS = original.messageAttachments;
  });

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    await response.text();
    return response.headers.get('set-cookie')!.split(';')[0]!;
  }

  /** A signed-in creative with one offer. A new account per test keeps each rate-limit count apart. */
  async function signedIn() {
    const { user, profile } = await makeCreative({ user: { passwordHash: await hashPassword(PASSWORD) } });
    const offer = await makeOffer(profile.id);
    return { user, profile, offer, cookie: await signIn(user.username) };
  }

  async function call(cookie: string | null, method: string, path: string, body?: unknown): Promise<ApiReply> {
    const response = await fetch(`${base}/media${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json()) as Omit<ApiReply, 'status'>;
    return { status: response.status, ...json };
  }

  const ticket = (cookie: string, body: Record<string, unknown>) => call(cookie, 'POST', '/uploads', body);

  const audio = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'audio',
    mimeType: 'audio/mpeg',
    sizeBytes: 4 * MB,
    durationSeconds: 120,
    ...overrides,
  });

  const video = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 40 * MB,
    durationSeconds: 90,
    ...overrides,
  });

  const image = (offerId: string, overrides: Record<string, unknown> = {}) => ({
    destination: 'offer',
    offerId,
    kind: 'image',
    mimeType: 'image/webp',
    sizeBytes: 500_000,
    thumbSizeBytes: 40_000,
    ...overrides,
  });

  async function reservationsOf(userId: string) {
    return db.select().from(mediaUploads).where(eq(mediaUploads.userId, userId));
  }

  async function insertItem(offerId: string, overrides: Partial<typeof offerImages.$inferInsert> = {}) {
    const key = `offers/x/${randomUUID()}`;
    await db.insert(offerImages).values({
      offerId,
      objectKey: `${key}.webp`,
      thumbKey: `${key}-thumb.webp`,
      ...overrides,
    });
  }

  /** A reservation written directly, for the verification tests. */
  async function reserve(
    userId: string,
    offerId: string,
    overrides: Partial<typeof mediaUploads.$inferInsert> = {},
  ) {
    const [row] = await db
      .insert(mediaUploads)
      .values({
        userId,
        destination: 'offer',
        offerId,
        kind: 'audio',
        bucket: 'media-audio',
        objectKey: `offers/x/${randomUUID()}.mp3`,
        mimeType: 'audio/mpeg',
        sizeBytes: 500_000,
        durationSeconds: 120,
        reservedBytes: 15 * MB,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ...overrides,
      })
      .returning();
    return row!;
  }

  const object = (name: string, size: number, mimetype: string): StoredObject => ({
    name,
    updatedAt: new Date().toISOString(),
    size,
    mimetype,
  });

  it('issues an image ticket with two signed PUT URLs and a reservation', async () => {
    const { user, profile, offer, cookie } = await signedIn();

    const result = await ticket(cookie, image(offer.id));

    expect(result.status).toBe(201);
    const data = result.data as Extract<UploadTicket, { kind: 'image' }>;
    expect(data.kind).toBe('image');
    expect(data.transport).toBe('put');
    expect(data.file.objectKey).toMatch(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}\\.webp$`));
    expect(data.thumb.objectKey).toBe(data.file.objectKey.replace(/\.webp$/, '-thumb.webp'));
    expect(data.file.uploadUrl).toContain('/upload/media/');
    expect(signUpload).toHaveBeenCalledWith(data.file.objectKey, 'media');
    expect(signUpload).toHaveBeenCalledWith(data.thumb.objectKey, 'media');

    const [row] = await reservationsOf(user.id);
    expect(row).toMatchObject({
      id: data.reservationId,
      offerId: offer.id,
      kind: 'image',
      bucket: 'media',
      objectKey: data.file.objectKey,
      thumbKey: data.thumb.objectKey,
      sizeBytes: 500_000,
      thumbSizeBytes: 40_000,
      reservedBytes: 4 * MB,
    });
    expect(row!.expiresAt.toISOString()).toBe(data.expiresAt);
  });

  it('issues an audio ticket with a TUS endpoint, token, bucket and key', async () => {
    const { user, profile, offer, cookie } = await signedIn();

    const result = await ticket(cookie, audio(offer.id, { mimeType: 'audio/x-m4a', durationSeconds: 125.2 }));

    expect(result.status).toBe(201);
    const data = result.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(data.transport).toBe('tus');
    expect(data.tus).toEqual({
      endpoint: 'http://storage.test/storage/v1/upload/resumable/sign',
      token: 't',
      bucket: 'media-audio',
      objectKey: expect.stringMatching(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}\\.m4a$`)),
    });
    expect(data.poster).toBeUndefined();
    expect(signUpload).toHaveBeenCalledWith(data.tus.objectKey, 'media-audio');

    const [row] = await reservationsOf(user.id);
    expect(row).toMatchObject({ mimeType: 'audio/mp4', durationSeconds: 126, reservedBytes: 15 * MB });
  });

  it('issues a video ticket with a poster URL only when a poster size is declared', async () => {
    const { profile, offer, cookie } = await signedIn();

    const withPoster = await ticket(cookie, video(offer.id, { thumbSizeBytes: 80_000 }));
    const without = await ticket(cookie, video(offer.id, { mimeType: 'video/webm' }));

    expect(withPoster.status).toBe(201);
    const posted = withPoster.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(posted.tus.bucket).toBe('media-video');
    expect(posted.tus.objectKey).toMatch(/\.mp4$/);
    expect(posted.poster?.objectKey).toMatch(new RegExp(`^offers/${profile.id}/[0-9a-f-]{36}-poster\\.webp$`));
    expect(signUpload).toHaveBeenCalledWith(posted.poster!.objectKey, 'media');

    expect(without.status).toBe(201);
    const bare = without.data as Extract<UploadTicket, { transport: 'tus' }>;
    expect(bare.tus.objectKey).toMatch(/\.webm$/);
    expect(bare.poster).toBeUndefined();
  });

  it('refuses a kind that is switched off with 403 MEDIA_KIND_DISABLED', async () => {
    const { user, offer, cookie } = await signedIn();
    env.MEDIA_UPLOAD_KINDS = [];

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(403);
    expect(result.error?.code).toBe('MEDIA_KIND_DISABLED');
    expect(result.error?.details).toEqual({ enabledKinds: ['image'] });
    expect(await reservationsOf(user.id)).toHaveLength(0);
    expect(signUpload).not.toHaveBeenCalled();
  });

  it('refuses a disallowed type with 422 MEDIA_TYPE_NOT_ALLOWED', async () => {
    const { offer, cookie } = await signedIn();

    const mov = await ticket(cookie, video(offer.id, { mimeType: 'video/quicktime' }));
    const svg = await ticket(cookie, image(offer.id, { mimeType: 'image/svg+xml' }));

    expect(mov.status).toBe(422);
    expect(mov.error?.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
    expect(mov.error?.details).toEqual({ mimeTypes: ['video/mp4', 'video/webm'] });
    expect(svg.status).toBe(422);
    expect(svg.error?.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
  });

  it('refuses an oversized file with 422 MEDIA_TOO_LARGE and the limit in details', async () => {
    const { offer, cookie } = await signedIn();

    const big = await ticket(cookie, audio(offer.id, { sizeBytes: 15 * MB + 1 }));
    const bigPoster = await ticket(cookie, video(offer.id, { thumbSizeBytes: 2 * MB + 1 }));
    const noThumb = await ticket(cookie, image(offer.id, { thumbSizeBytes: undefined }));
    const bigVideo = await ticket(cookie, video(offer.id, { sizeBytes: 300 * MB + 1 }));

    expect(big.status).toBe(422);
    expect(big.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 15 * MB } });
    expect(bigPoster.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 2 * MB } });
    expect(noThumb.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 2 * MB } });
    expect(bigVideo.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 300 * MB } });
  });

  it('refuses audio or video without a duration, or over it, with 422 MEDIA_TOO_LONG', async () => {
    const { offer, cookie } = await signedIn();

    const noDuration = await ticket(cookie, audio(offer.id, { durationSeconds: undefined }));
    const longAudio = await ticket(cookie, audio(offer.id, { durationSeconds: 600.5 }));
    const longVideo = await ticket(cookie, video(offer.id, { durationSeconds: 301 }));

    expect(noDuration.status).toBe(422);
    expect(noDuration.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 600 } });
    expect(longAudio.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 600 } });
    expect(longVideo.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 300 } });
  });

  it('counts reservations toward the per-offer limit (409 MEDIA_LIMIT_REACHED on the third video)', async () => {
    const { user, offer, cookie } = await signedIn();

    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    const third = await ticket(cookie, video(offer.id));

    expect(third.status).toBe(409);
    expect(third.error).toMatchObject({ code: 'MEDIA_LIMIT_REACHED', details: { perTarget: 2 } });
    expect(await reservationsOf(user.id)).toHaveLength(2);
  });

  it('does not count pending_remove items toward the limit', async () => {
    const { offer, cookie } = await signedIn();
    await insertItem(offer.id, { kind: 'video', state: 'live' });
    await insertItem(offer.id, { kind: 'video', state: 'pending_remove' });

    expect((await ticket(cookie, video(offer.id))).status).toBe(201);
    const next = await ticket(cookie, video(offer.id));

    expect(next.status).toBe(409);
    expect(next.error?.code).toBe('MEDIA_LIMIT_REACHED');
  });

  it('refuses over the quota with 409 MEDIA_QUOTA_EXCEEDED', async () => {
    const { user, profile, cookie } = await signedIn();
    const other = await makeOffer(profile.id);
    await insertItem(other.id, { kind: 'video', sizeBytes: 999_000_000 });
    const offer = await makeOffer(profile.id);

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(409);
    expect(result.error).toMatchObject({ code: 'MEDIA_QUOTA_EXCEEDED', details: { quotaBytes: 1_000 * MB } });
    expect(await reservationsOf(user.id)).toHaveLength(0);
  });

  it("answers 404 for another creative's offer, and 403 without a creative profile", async () => {
    const { cookie } = await signedIn();
    const stranger = await makeCreative();
    const theirs = await makeOffer(stranger.profile.id);
    const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const clientCookie = await signIn(client.username);

    const foreign = await ticket(cookie, audio(theirs.id));
    const noProfile = await ticket(clientCookie, audio(theirs.id));

    expect(foreign.status).toBe(404);
    expect(foreign.error?.message).toBe('No such offer.');
    expect(noProfile.status).toBe(403);
    expect(noProfile.error?.message).toBe('A creative profile is required to manage offers');
  });

  it("clears the caller's expired reservations when issuing a ticket, and discards their objects", async () => {
    const { user, offer, cookie } = await signedIn();
    const stale = await reserve(user.id, offer.id, {
      kind: 'video',
      bucket: 'media-video',
      objectKey: `offers/x/${randomUUID()}.mp4`,
      thumbKey: `offers/x/${randomUUID()}-poster.webp`,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await ticket(cookie, audio(offer.id));

    expect(result.status).toBe(201);
    const rows = await reservationsOf(user.id);
    expect(rows.map((row) => row.id)).not.toContain(stale.id);
    expect(rows).toHaveLength(1);
    expect(discard).toHaveBeenCalledWith(stale.objectKey, 'media-video');
    expect(discard).toHaveBeenCalledWith(stale.thumbKey, 'media');
  });

  it("abandons a reservation: deletes the row and discards its objects; 404 for someone else's", async () => {
    const { user, offer, cookie } = await signedIn();
    const issued = (await ticket(cookie, video(offer.id, { thumbSizeBytes: 80_000 }))).data as Extract<
      UploadTicket,
      { transport: 'tus' }
    >;
    const other = await signedIn();

    const foreign = await call(other.cookie, 'DELETE', `/uploads/${issued.reservationId}`);
    expect(foreign.status).toBe(404);
    expect(foreign.error?.message).toBe('No such upload.');
    expect(await reservationsOf(user.id)).toHaveLength(1);

    const result = await call(cookie, 'DELETE', `/uploads/${issued.reservationId}`);

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ ok: true });
    expect(await reservationsOf(user.id)).toHaveLength(0);
    expect(discard).toHaveBeenCalledWith(issued.tus.objectKey, 'media-video');
    expect(discard).toHaveBeenCalledWith(issued.poster!.objectKey, 'media');
  });

  it('serves the limits publicly with images enabled and the rest following the switch', async () => {
    env.MEDIA_UPLOAD_KINDS = ['audio'];

    const result = await call(null, 'GET', '/limits');

    expect(result.status).toBe(200);
    const limits = result.data as MediaLimits;
    expect(limits.quotaBytes).toBe(1_000 * MB);
    const offer = limits.destinations.offer;
    expect(offer.image).toMatchObject({ enabled: true, maxBytes: 2 * MB, maxPickedBytes: 20 * MB, perTarget: 10 });
    expect(offer.audio).toMatchObject({ enabled: true, maxBytes: 15 * MB, maxDurationSeconds: 600, transport: 'tus' });
    expect(offer.video).toMatchObject({ enabled: false, maxBytes: 300 * MB, maxDurationSeconds: 300, perTarget: 2 });
    expect(offer.document).toMatchObject({ enabled: false, mimeTypes: ['application/pdf'], perTarget: 3 });
    expect(limits.filesPerMessage).toBe(5);
    const message = limits.destinations.message;
    expect(message.video).toMatchObject({ enabled: true, maxBytes: 100 * MB, maxDurationSeconds: 180, perTarget: 5 });

    env.MESSAGE_ATTACHMENTS = false;
    const off = (await call(null, 'GET', '/limits')).data as MediaLimits;
    expect(Object.values(off.destinations.message).every((kind) => !kind.enabled)).toBe(true);
  });

  it('reports usage: recorded sizes plus unexpired reservations', async () => {
    const { user, offer, cookie } = await signedIn();
    await insertItem(offer.id, { kind: 'audio', sizeBytes: 3 * MB });
    await insertItem(offer.id);
    await reserve(user.id, offer.id);
    await reserve(user.id, offer.id, { expiresAt: new Date(Date.now() - 1000) });

    const result = await call(cookie, 'GET', '/usage');
    const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const none = await call(await signIn(client.username), 'GET', '/usage');

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ usedBytes: 3 * MB, reservedBytes: 15 * MB, quotaBytes: 1_000 * MB });
    expect(none.data).toEqual({ usedBytes: 0, reservedBytes: 0, quotaBytes: 1_000 * MB });
  });

  it('limits tickets to 30 an hour (the 31st answers 429)', async () => {
    const { cookie } = await signedIn();

    for (let index = 0; index < 30; index += 1) {
      const result = await ticket(cookie, {});
      expect(result.status, `ticket ${index + 1}`).toBe(400);
    }
    const last = await ticket(cookie, {});

    expect(last.status).toBe(429);
    expect(last.error?.code).toBe('RATE_LIMITED');
  });

  describe('tickets for a conversation (ADR 0060)', () => {
    /** A creative and a client in one conversation, the client signed in. */
    async function inConversation() {
      const creative = await signedIn();
      const client = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
      const conversation = await makeConversation(client.id, creative.profile);
      return { creative, client, conversation, cookie: await signIn(client.username) };
    }

    /** An offer ticket body pointed at a conversation instead. */
    const toMessage = (body: Record<string, unknown>, conversationId: string) => ({
      ...body,
      destination: 'message',
      offerId: undefined,
      conversationId,
    });

    const pdf = (overrides: Record<string, unknown> = {}) => ({
      kind: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 2 * MB,
      ...overrides,
    });

    it('issues a ticket into the private message buckets, keyed by conversation', async () => {
      const { client, conversation, cookie } = await inConversation();

      const photo = await ticket(cookie, toMessage(image(''), conversation.id));
      const clip = await ticket(cookie, toMessage(audio(''), conversation.id));

      expect(photo.status).toBe(201);
      const put = photo.data as Extract<UploadTicket, { kind: 'image' }>;
      expect(put.file.objectKey).toMatch(new RegExp(`^messages/${conversation.id}/[0-9a-f-]{36}\\.webp$`));
      expect(signUpload).toHaveBeenCalledWith(put.file.objectKey, 'media-messages');
      expect(signUpload).toHaveBeenCalledWith(put.thumb.objectKey, 'media-messages');
      expect(clip.status).toBe(201);
      const tus = clip.data as Extract<UploadTicket, { transport: 'tus' }>;
      expect(tus.tus.bucket).toBe('media-messages-audio');
      expect(tus.tus.objectKey).toMatch(new RegExp(`^messages/${conversation.id}/[0-9a-f-]{36}\\.mp3$`));

      const rows = await reservationsOf(client.id);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({ destination: 'message', conversationId: conversation.id, offerId: null });
      }
    });

    it('answers 404 to someone outside the conversation, and 403 when the other person blocked the caller', async () => {
      const { creative, client, conversation, cookie } = await inConversation();
      const outsider = await signedIn();
      await db.insert(userBlocks).values({ blockerUserId: creative.user.id, blockedUserId: client.id });

      const foreign = await ticket(outsider.cookie, toMessage(image(''), conversation.id));
      const blocked = await ticket(cookie, toMessage(image(''), conversation.id));

      expect(foreign.status).toBe(404);
      expect(foreign.error?.message).toBe('No such conversation.');
      expect(blocked.status).toBe(403);
      expect(await reservationsOf(client.id)).toHaveLength(0);
      expect(await reservationsOf(outsider.user.id)).toHaveLength(0);
    });

    it('refuses a sixth pending file with 409 MEDIA_MESSAGE_FULL, counting this caller and conversation only', async () => {
      const { creative, client, conversation, cookie } = await inConversation();
      const elsewhere = await makeConversation(client.id, (await makeCreative()).profile);

      for (const body of [image(''), audio(''), video(''), pdf(), image('')]) {
        expect((await ticket(cookie, toMessage(body, conversation.id))).status).toBe(201);
      }
      const sixth = await ticket(cookie, toMessage(pdf(), conversation.id));
      const another = await ticket(cookie, toMessage(pdf(), elsewhere.id));
      const otherSide = await ticket(creative.cookie, toMessage(pdf(), conversation.id));

      expect(sixth.status).toBe(409);
      expect(sixth.error).toMatchObject({ code: 'MEDIA_MESSAGE_FULL', details: { filesPerMessage: 5 } });
      expect(another.status).toBe(201);
      expect(otherSide.status).toBe(201);
    });

    it("refuses a file over a message's caps, or of a type a message does not take", async () => {
      const { conversation, cookie } = await inConversation();

      const long = await ticket(cookie, toMessage(video('', { durationSeconds: 181 }), conversation.id));
      const large = await ticket(cookie, toMessage(video('', { sizeBytes: 100 * MB + 1 }), conversation.id));
      const bigPdf = await ticket(cookie, toMessage(pdf({ sizeBytes: 10 * MB + 1 }), conversation.id));
      const bigPhoto = await ticket(cookie, toMessage(image('', { sizeBytes: 2 * MB + 1 }), conversation.id));
      const bigClip = await ticket(cookie, toMessage(audio('', { sizeBytes: 15 * MB + 1 }), conversation.id));
      const longClip = await ticket(cookie, toMessage(audio('', { durationSeconds: 601 }), conversation.id));
      const word = await ticket(
        cookie,
        toMessage(
          pdf({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
          conversation.id,
        ),
      );

      expect(long.status).toBe(422);
      expect(long.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 180 } });
      expect(large.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 100 * MB } });
      expect(bigPdf.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 10 * MB } });
      expect(bigPhoto.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 2 * MB } });
      expect(bigClip.error).toMatchObject({ code: 'MEDIA_TOO_LARGE', details: { maxBytes: 15 * MB } });
      expect(longClip.error).toMatchObject({ code: 'MEDIA_TOO_LONG', details: { maxDurationSeconds: 600 } });
      expect(word.status).toBe(422);
      expect(word.error).toMatchObject({ code: 'MEDIA_TYPE_NOT_ALLOWED', details: { mimeTypes: ['application/pdf'] } });
    });

    it('refuses every kind with 403 MEDIA_KIND_DISABLED when MESSAGE_ATTACHMENTS is off', async () => {
      const { client, conversation, cookie } = await inConversation();
      env.MESSAGE_ATTACHMENTS = false;

      for (const body of [image(''), audio(''), video(''), pdf()]) {
        const result = await ticket(cookie, toMessage(body, conversation.id));

        expect(result.status, body.kind).toBe(403);
        expect(result.error).toMatchObject({ code: 'MEDIA_KIND_DISABLED', details: { enabledKinds: [] } });
      }
      expect(await reservationsOf(client.id)).toHaveLength(0);
    });

    it("does not count a message's files against the offer quota", async () => {
      const { creative, conversation } = await inConversation();
      await insertItem(creative.offer.id, { kind: 'video', sizeBytes: 980 * MB });

      const sent = await ticket(creative.cookie, toMessage(video('', { sizeBytes: 90 * MB }), conversation.id));
      const usage = await call(creative.cookie, 'GET', '/usage');
      const offerAudio = await ticket(creative.cookie, audio(creative.offer.id, { sizeBytes: MB }));

      expect(sent.status).toBe(201);
      expect(usage.data).toMatchObject({ usedBytes: 980 * MB, reservedBytes: 0 });
      expect(offerAudio.status).toBe(201);
    });

    it('verifies a message upload, reading its poster from the private image bucket', async () => {
      const { client, conversation, cookie } = await inConversation();
      const body = toMessage(video('', { sizeBytes: 1_000_000, thumbSizeBytes: 50_000 }), conversation.id);
      const issued = (await ticket(cookie, body)).data as Extract<UploadTicket, { transport: 'tus' }>;
      stored.mockImplementation(async (bucket, key) =>
        bucket === 'media-messages-video'
          ? object(key, 1_000_000, 'video/mp4')
          : bucket === 'media-messages'
            ? object(key, 50_000, 'image/webp')
            : null,
      );
      firstBytes.mockImplementation(async (bucket) => (bucket === 'media-messages-video' ? MP4 : WEBP));

      const verified = await verifyReservation(client.id, issued.reservationId);

      expect(verified).toMatchObject({
        destination: 'message',
        offerId: null,
        conversationId: conversation.id,
        bucket: 'media-messages-video',
        thumbKey: issued.poster!.objectKey,
        sizeBytes: 1_050_000,
      });
    });
  });

  describe('verifyReservation', () => {
    it('verifies a stored upload and returns its facts without deleting the reservation', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id, {
        kind: 'video',
        bucket: 'media-video',
        objectKey: `offers/x/${randomUUID()}.mp4`,
        thumbKey: `offers/x/${randomUUID()}-poster.webp`,
        mimeType: 'video/mp4',
        sizeBytes: 1_000_000,
        thumbSizeBytes: 50_000,
        durationSeconds: 61,
      });
      stored.mockImplementation(async (bucket, key) =>
        bucket === 'media-video' && key === row.objectKey
          ? object(key, 1_000_000, 'video/mp4')
          : bucket === 'media' && key === row.thumbKey
            ? object(key, 50_000, 'image/webp')
            : null,
      );
      firstBytes.mockImplementation(async (bucket) => (bucket === 'media-video' ? MP4 : WEBP));

      const verified = await verifyReservation(user.id, row.id);

      expect(verified).toEqual({
        reservationId: row.id,
        destination: 'offer',
        offerId: offer.id,
        conversationId: null,
        kind: 'video',
        bucket: 'media-video',
        objectKey: row.objectKey,
        thumbKey: row.thumbKey,
        mimeType: 'video/mp4',
        sizeBytes: 1_050_000,
        durationSeconds: 61,
      });
      expect(await reservationsOf(user.id)).toHaveLength(1);
      expect(discard).not.toHaveBeenCalled();
    });

    it('fails verification when the object is missing, deleting the reservation and objects', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id, {
        kind: 'video',
        bucket: 'media-video',
        objectKey: `offers/x/${randomUUID()}.mp4`,
        thumbKey: `offers/x/${randomUUID()}-poster.webp`,
        mimeType: 'video/mp4',
      });

      await expect(verifyReservation(user.id, row.id)).rejects.toMatchObject({
        status: 422,
        code: 'MEDIA_VERIFICATION_FAILED',
        details: { reason: 'missing' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(row.objectKey, 'media-video');
      expect(discard).toHaveBeenCalledWith(row.thumbKey, 'media');
    });

    it('fails verification when the stored size differs from the declared size', async () => {
      const { user, offer } = await signedIn();
      const row = await reserve(user.id, offer.id);
      stored.mockResolvedValue(object(row.objectKey, 499_999, 'audio/mpeg'));
      firstBytes.mockResolvedValue(ID3);

      await expect(verifyReservation(user.id, row.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'size' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(row.objectKey, 'media-audio');
    });

    it('fails verification when the stored type differs, or the signature does not match', async () => {
      const { user, offer } = await signedIn();
      const relabelled = await reserve(user.id, offer.id);
      const forged = await reserve(user.id, offer.id);
      stored.mockImplementation(async (_bucket, key) =>
        object(key, 500_000, key === relabelled.objectKey ? 'audio/ogg' : 'audio/mpeg'),
      );
      firstBytes.mockResolvedValue(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]));

      await expect(verifyReservation(user.id, relabelled.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'type' },
      });
      await expect(verifyReservation(user.id, forged.id)).rejects.toMatchObject({
        status: 422,
        details: { reason: 'signature' },
      });
      expect(await reservationsOf(user.id)).toHaveLength(0);
    });

    it('accepts a JPEG fallback stored under a .webp image key', async () => {
      const { user, offer } = await signedIn();
      const key = `offers/x/${randomUUID()}`;
      const row = await reserve(user.id, offer.id, {
        kind: 'image',
        bucket: 'media',
        objectKey: `${key}.webp`,
        thumbKey: `${key}-thumb.webp`,
        mimeType: 'image/jpeg',
        sizeBytes: 600_000,
        thumbSizeBytes: 60_000,
        durationSeconds: null,
        reservedBytes: 4 * MB,
      });
      stored.mockImplementation(async (_bucket, name) =>
        object(name, name.endsWith('-thumb.webp') ? 55_000 : 590_000, 'image/jpeg'),
      );
      firstBytes.mockResolvedValue(JPEG);

      const verified = await verifyReservation(user.id, row.id);

      expect(verified).toMatchObject({ kind: 'image', mimeType: 'image/jpeg', sizeBytes: 645_000 });
    });

    it('answers 410 MEDIA_UPLOAD_EXPIRED for an expired or unknown reservation', async () => {
      const { user, offer } = await signedIn();
      const lapsed = await reserve(user.id, offer.id, { expiresAt: new Date(Date.now() - 1000) });
      const other = await signedIn();
      const theirs = await reserve(other.user.id, other.offer.id);

      await expect(verifyReservation(user.id, lapsed.id)).rejects.toMatchObject({
        status: 410,
        code: 'MEDIA_UPLOAD_EXPIRED',
      });
      await expect(verifyReservation(user.id, randomUUID())).rejects.toMatchObject({ status: 410 });
      await expect(verifyReservation(user.id, theirs.id)).rejects.toMatchObject({ status: 410 });
      expect(await reservationsOf(user.id)).toHaveLength(0);
      expect(discard).toHaveBeenCalledWith(lapsed.objectKey, 'media-audio');
      expect(await reservationsOf(other.user.id)).toHaveLength(1);
      expect(stored).not.toHaveBeenCalled();
    });
  });

  describe('covers (issue #36, ADR 0061)', () => {
    const KB = 1_000;
    const COVER_KEY = /^covers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

    /** A fresh pair under the profile's own prefix, as a ticket would name it. */
    const pairFor = (profileId: string) => {
      const base = `covers/${profileId}/${randomUUID()}`;
      return { objectKey: `${base}.webp`, smallKey: `${base}-768.webp` };
    };

    /** Storage reports these sizes (missing key: not stored) and these first bytes. */
    function storageHolds(sizes: Record<string, number>, bytes: Uint8Array = WEBP) {
      stored.mockImplementation(async (_bucket: string, objectKey: string) =>
        objectKey in sizes ? { name: objectKey, updatedAt: null, size: sizes[objectKey]!, mimetype: 'image/webp' } : null,
      );
      firstBytes.mockResolvedValue(bytes);
    }

    async function coverRow(profileId: string) {
      const [row] = await db
        .select({
          coverKey: creativeProfiles.coverKey,
          coverSmallKey: creativeProfiles.coverSmallKey,
          coverPendingKey: creativeProfiles.coverPendingKey,
          coverPendingSmallKey: creativeProfiles.coverPendingSmallKey,
          coverRejectionReason: creativeProfiles.coverRejectionReason,
          editedSinceReviewAt: creativeProfiles.editedSinceReviewAt,
        })
        .from(creativeProfiles)
        .where(eq(creativeProfiles.id, profileId));
      return row!;
    }

    const setCover = (cookie: string, pair: { objectKey: string; smallKey: string }) =>
      call(cookie, 'PUT', '/cover', pair);

    it('issues a ticket for two widths of one cover under the profile', async () => {
      const { profile, cookie } = await signedIn();
      const reply = await call(cookie, 'POST', '/upload-url', { kind: 'cover' });

      expect(reply.status).toBe(200);
      const data = reply.data as { kind: string; full: { objectKey: string }; small: { objectKey: string } };
      expect(data.kind).toBe('cover');
      expect(data.full.objectKey).toMatch(COVER_KEY);
      expect(data.full.objectKey.startsWith(`covers/${profile.id}/`)).toBe(true);
      expect(data.small.objectKey).toBe(data.full.objectKey.replace(/\.webp$/, '-768.webp'));
    });

    it('refuses a cover ticket to an account with no creative profile', async () => {
      const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
      const reply = await call(await signIn(user.username), 'POST', '/upload-url', { kind: 'cover' });
      expect(reply.status).toBe(403);
    });

    it('puts a new cover in the pending pair, leaving the approved one and the Edited flag alone', async () => {
      const { profile, cookie } = await signedIn();
      const approved = pairFor(profile.id);
      await db
        .update(creativeProfiles)
        .set({ status: 'published', coverKey: approved.objectKey, coverSmallKey: approved.smallKey, coverRejectionReason: 'Too dark.' })
        .where(eq(creativeProfiles.id, profile.id));
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 300 * KB, [pair.smallKey]: 90 * KB });

      const reply = await setCover(cookie, pair);

      expect(reply.status).toBe(200);
      expect(await coverRow(profile.id)).toEqual({
        coverKey: approved.objectKey,
        coverSmallKey: approved.smallKey,
        coverPendingKey: pair.objectKey,
        coverPendingSmallKey: pair.smallKey,
        coverRejectionReason: null,
        editedSinceReviewAt: null,
      });
      expect(discard).not.toHaveBeenCalled();
    });

    it('replaces a waiting cover, discarding the old pending pair only', async () => {
      const { profile, cookie } = await signedIn();
      const first = pairFor(profile.id);
      const second = pairFor(profile.id);
      storageHolds({ [first.objectKey]: 300 * KB, [first.smallKey]: 90 * KB, [second.objectKey]: 300 * KB, [second.smallKey]: 90 * KB });

      expect((await setCover(cookie, first)).status).toBe(200);
      expect((await setCover(cookie, second)).status).toBe(200);

      const row = await coverRow(profile.id);
      expect(row.coverPendingKey).toBe(second.objectKey);
      expect(row.coverPendingSmallKey).toBe(second.smallKey);
      expect(discard.mock.calls.map(([key]) => key).sort()).toEqual([first.objectKey, first.smallKey].sort());
    });

    it("refuses another profile's cover keys with 403", async () => {
      const { profile, cookie } = await signedIn();
      const other = await makeCreative();
      const reply = await setCover(cookie, pairFor(other.profile.id));

      expect(reply.status).toBe(403);
      expect((await coverRow(profile.id)).coverPendingKey).toBeNull();
    });

    it('refuses two keys that are not one cover', async () => {
      const { profile, cookie } = await signedIn();
      const reply = await setCover(cookie, { objectKey: pairFor(profile.id).objectKey, smallKey: pairFor(profile.id).smallKey });
      expect(reply.status).toBe(400);
    });

    it('refuses a key that climbs out of its folder', async () => {
      const { profile, cookie } = await signedIn();
      const objectKey = `covers/${profile.id}/../../avatars/x/y.webp`;
      const reply = await setCover(cookie, { objectKey, smallKey: objectKey.replace(/\.webp$/, '-768.webp') });
      expect(reply.status).toBe(400);
    });

    it('refuses a cover over 2 MB with COVER_TOO_LARGE, and discards both files', async () => {
      const { profile, cookie } = await signedIn();
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 2 * MB + 1, [pair.smallKey]: 90 * KB });

      const reply = await setCover(cookie, pair);

      expect(reply.status).toBe(400);
      expect(reply.error?.code).toBe('COVER_TOO_LARGE');
      expect(discard.mock.calls.map(([key]) => key).sort()).toEqual([pair.objectKey, pair.smallKey].sort());
      expect((await coverRow(profile.id)).coverPendingKey).toBeNull();
    });

    it('accepts a cover of exactly 2 MB', async () => {
      const { profile, cookie } = await signedIn();
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 2 * MB, [pair.smallKey]: 90 * KB });
      expect((await setCover(cookie, pair)).status).toBe(200);
    });

    it('refuses a file that is not a photo with COVER_NOT_AN_IMAGE, and discards both files', async () => {
      const { profile, cookie } = await signedIn();
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 300 * KB, [pair.smallKey]: 90 * KB }, ID3);

      const reply = await setCover(cookie, pair);

      expect(reply.status).toBe(400);
      expect(reply.error?.code).toBe('COVER_NOT_AN_IMAGE');
      expect(discard).toHaveBeenCalledTimes(2);
      expect((await coverRow(profile.id)).coverPendingKey).toBeNull();
    });

    it('accepts the JPEG the resizer falls back to', async () => {
      const { profile, cookie } = await signedIn();
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 300 * KB, [pair.smallKey]: 90 * KB }, JPEG);
      expect((await setCover(cookie, pair)).status).toBe(200);
    });

    it('answers UPLOAD_INCOMPLETE when one of the pair was never stored', async () => {
      const { profile, cookie } = await signedIn();
      const pair = pairFor(profile.id);
      storageHolds({ [pair.objectKey]: 300 * KB });

      const reply = await setCover(cookie, pair);

      expect(reply.status).toBe(400);
      expect(reply.error?.code).toBe('UPLOAD_INCOMPLETE');
      expect((await coverRow(profile.id)).coverPendingKey).toBeNull();
    });

    it('removes a waiting cover first, then the approved one, then nothing', async () => {
      const { profile, cookie } = await signedIn();
      const approved = pairFor(profile.id);
      const pending = pairFor(profile.id);
      await db
        .update(creativeProfiles)
        .set({
          coverKey: approved.objectKey,
          coverSmallKey: approved.smallKey,
          coverPendingKey: pending.objectKey,
          coverPendingSmallKey: pending.smallKey,
        })
        .where(eq(creativeProfiles.id, profile.id));

      const first = await call(cookie, 'DELETE', '/cover');
      expect(first.status).toBe(200);
      expect(first.data).toEqual({ ok: true, removed: 'pending' });
      let row = await coverRow(profile.id);
      expect([row.coverPendingKey, row.coverPendingSmallKey]).toEqual([null, null]);
      expect(row.coverKey).toBe(approved.objectKey);

      const second = await call(cookie, 'DELETE', '/cover');
      expect(second.data).toEqual({ ok: true, removed: 'approved' });
      row = await coverRow(profile.id);
      expect([row.coverKey, row.coverSmallKey]).toEqual([null, null]);

      const third = await call(cookie, 'DELETE', '/cover');
      expect(third.status).toBe(200);
      expect(discard.mock.calls.map(([key]) => key).sort()).toEqual(
        [pending.objectKey, pending.smallKey, approved.objectKey, approved.smallKey].sort(),
      );
    });

    it('answers 401 to a suspended creative on every cover route (ADR 0028)', async () => {
      const { user, profile, cookie } = await signedIn();
      await suspend(user.id);
      const pair = pairFor(profile.id);

      expect((await call(cookie, 'POST', '/upload-url', { kind: 'cover' })).status).toBe(401);
      expect((await setCover(cookie, pair)).status).toBe(401);
      expect((await call(cookie, 'DELETE', '/cover')).status).toBe(401);
    });

    it("abandons an own cover file, and refuses another profile's", async () => {
      const { profile, cookie } = await signedIn();
      const other = await makeCreative();

      const own = await call(cookie, 'POST', '/abandon', { objectKey: pairFor(profile.id).objectKey });
      expect(own.status).toBe(200);
      expect(remove).toHaveBeenCalledTimes(1);

      const theirs = await call(cookie, 'POST', '/abandon', { objectKey: pairFor(other.profile.id).objectKey });
      expect(theirs.status).toBe(403);
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('abandon (issue #115)', () => {
    const abandon = (cookie: string, objectKey: string) => call(cookie, 'POST', '/abandon', { objectKey });
    const fresh = (folder: string, ownerId: string, suffix = '.webp') => `${folder}/${ownerId}/${randomUUID()}${suffix}`;

    /** Refused as in use, with nothing deleted. */
    async function expectKept(cookie: string, objectKey: string) {
      const reply = await abandon(cookie, objectKey);
      expect(reply.status).toBe(409);
      expect(reply.error?.code).toBe('CONFLICT');
      expect(remove).not.toHaveBeenCalled();
    }

    it('keeps a profile photo in use, approved or waiting', async () => {
      const { user, cookie } = await signedIn();
      const approved = fresh('avatars', user.id);
      const waiting = fresh('avatars', user.id);
      await db.update(users).set({ avatarKey: approved, avatarPendingKey: waiting }).where(eq(users.id, user.id));

      await expectKept(cookie, approved);
      await expectKept(cookie, waiting);
      const [row] = await db.select().from(users).where(eq(users.id, user.id));
      expect(row).toMatchObject({ avatarKey: approved, avatarPendingKey: waiting });
    });

    it("keeps an offer's file in use: the file or its thumbnail, live or waiting, of any kind", async () => {
      const { profile, offer, cookie } = await signedIn();
      const live = fresh('offers', profile.id, '');
      const waiting = fresh('offers', profile.id, '');
      const recording = fresh('offers', profile.id, '.mp3');
      await insertItem(offer.id, { objectKey: `${live}.webp`, thumbKey: `${live}-thumb.webp` });
      await insertItem(offer.id, { objectKey: `${waiting}.webp`, thumbKey: `${waiting}-thumb.webp`, state: 'pending_add' });
      await insertItem(offer.id, { kind: 'audio', mimeType: 'audio/mpeg', objectKey: recording, thumbKey: null });

      for (const key of [`${live}.webp`, `${live}-thumb.webp`, `${waiting}.webp`, `${waiting}-thumb.webp`, recording]) {
        await expectKept(cookie, key);
      }
    });

    it('keeps a file an upload in progress holds', async () => {
      const { user, profile, offer, cookie } = await signedIn();
      const base = fresh('offers', profile.id, '');
      await reserve(user.id, offer.id, {
        kind: 'image',
        bucket: env.SUPABASE_STORAGE_BUCKET,
        objectKey: `${base}.webp`,
        thumbKey: `${base}-thumb.webp`,
        mimeType: 'image/webp',
        durationSeconds: null,
      });

      await expectKept(cookie, `${base}.webp`);
      await expectKept(cookie, `${base}-thumb.webp`);
    });

    it('keeps a cover in use: either width, approved or waiting', async () => {
      const { profile, cookie } = await signedIn();
      const approved = fresh('covers', profile.id, '');
      const waiting = fresh('covers', profile.id, '');
      await db
        .update(creativeProfiles)
        .set({
          coverKey: `${approved}.webp`,
          coverSmallKey: `${approved}-768.webp`,
          coverPendingKey: `${waiting}.webp`,
          coverPendingSmallKey: `${waiting}-768.webp`,
        })
        .where(eq(creativeProfiles.id, profile.id));

      for (const key of [`${approved}.webp`, `${approved}-768.webp`, `${waiting}.webp`, `${waiting}-768.webp`]) {
        await expectKept(cookie, key);
      }
    });

    it('still deletes an own upload nothing uses, in each folder', async () => {
      const { user, profile, offer, cookie } = await signedIn();
      // A reservation that has expired holds nothing.
      const expired = fresh('offers', profile.id);
      await reserve(user.id, offer.id, { objectKey: expired, expiresAt: new Date(Date.now() - 1000) });
      const keys = [fresh('avatars', user.id), fresh('offers', profile.id), fresh('covers', profile.id), expired];

      for (const key of keys) expect((await abandon(cookie, key)).status).toBe(200);
      expect(remove.mock.calls.map(([key]) => key)).toEqual(keys);
    });

    /**
     * Abandon and an attach of the same file, at once. The test holds the
     * owner's lock, so abandon must wait for it; the file is attached while it
     * waits, and abandon then finds it in use. No timing: the wait is read from
     * pg_locks.
     */
    async function raceAgainstAttach(
      lockKey: string,
      attach: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<unknown>,
      start: () => Promise<ApiReply>,
    ) {
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));

      const holder = db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
        locked();
        await released;
        await attach(tx);
      });
      await lockTaken;

      const abandoning = start();
      const waiting = async () => {
        const rows = (await db.execute(
          sql`select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted`,
        )) as unknown as { n: number }[];
        return rows[0]!.n > 0;
      };
      try {
        for (let i = 0; i < 200 && !(await waiting()); i++) await new Promise((resolve) => setTimeout(resolve, 25));
        expect(await waiting()).toBe(true);
      } finally {
        // Always let the holder finish, so a failed check leaves no open transaction.
        release();
        await holder;
      }
      return abandoning;
    }

    it('waits for a cover being attached, then keeps it', async () => {
      const { profile, cookie } = await signedIn();
      const key = fresh('covers', profile.id);

      const reply = await raceAgainstAttach(
        profile.id,
        (tx) => tx.update(creativeProfiles).set({ coverPendingKey: key }).where(eq(creativeProfiles.id, profile.id)),
        () => abandon(cookie, key),
      );

      expect(reply.status).toBe(409);
      expect(remove).not.toHaveBeenCalled();
    });

    // The other side of the lock: each path that attaches a file waits for it too.
    const nothing = async () => undefined;

    it('makes a new profile photo wait for the photo lock', async () => {
      const { user, cookie } = await signedIn();
      const reply = await raceAgainstAttach(`avatar:${user.id}`, nothing, () =>
        call(cookie, 'PUT', '/avatar', { objectKey: fresh('avatars', user.id) }),
      );
      expect(reply.status).toBe(200);
    });

    it('makes a new cover wait for the profile lock', async () => {
      const { profile, cookie } = await signedIn();
      const base = fresh('covers', profile.id, '');
      const pair = { objectKey: `${base}.webp`, smallKey: `${base}-768.webp` };
      stored.mockImplementation(async (_bucket: string, key: string) => object(key, 300_000, 'image/webp'));
      firstBytes.mockResolvedValue(WEBP);

      const reply = await raceAgainstAttach(profile.id, nothing, () => call(cookie, 'PUT', '/cover', pair));
      expect(reply.status).toBe(200);
    });

    it('makes an offer image on the old route wait for the profile lock', async () => {
      const { profile, offer, cookie } = await signedIn();
      const stem = fresh('offers', profile.id, '');
      const reply = await raceAgainstAttach(profile.id, nothing, async () => {
        const response = await fetch(`${base}/offers/${offer.id}/images`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ objectKey: `${stem}.webp`, thumbKey: `${stem}-thumb.webp` }),
        });
        return { status: response.status, ...((await response.json()) as Omit<ApiReply, 'status'>) };
      });
      expect(reply.status).toBe(201);
    });

    it('waits for a profile photo being attached, on its own lock, then keeps it', async () => {
      const { user, cookie } = await signedIn();
      const key = fresh('avatars', user.id);

      const reply = await raceAgainstAttach(
        `avatar:${user.id}`,
        (tx) => tx.update(users).set({ avatarPendingKey: key }).where(eq(users.id, user.id)),
        () => abandon(cookie, key),
      );

      expect(reply.status).toBe(409);
      expect(remove).not.toHaveBeenCalled();
    });
  });
});
