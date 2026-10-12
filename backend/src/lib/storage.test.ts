import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import {
  SIGNED_DOWNLOAD_MAX_SECONDS,
  bucketSettings,
  createSignedDownload,
  createSignedUpload,
  deleteObject,
  discardObject,
  idObjectKey,
  idStorageReady,
  listObjects,
  offerMediaKey,
  offerPosterKey,
  overrideIdStorageReady,
  publicUrl,
  readFirstBytes,
  saveBucket,
  storedObject,
  tusEndpoint,
} from './storage.js';

/**
 * Unit tests of the storage client against a stubbed `fetch`. Route tests never
 * stub `fetch` (they call the app with it) and mock this module instead, so no
 * route test belongs in this file.
 *
 * Responses are shaped as recorded with curl in plan 0053 Step 1.4.
 */

const STORAGE = 'http://storage.test';
const ID_KEY = 'ids/0b6f1d2e-0000-4000-8000-000000000001/3c9e-front.webp';

type Reply = { status?: number; body: unknown };

function reply({ status = 200, body }: Reply): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
}

const original = {
  url: env.SUPABASE_URL,
  key: env.SUPABASE_SERVICE_ROLE_KEY,
  media: env.SUPABASE_STORAGE_BUCKET,
  ids: env.SUPABASE_ID_BUCKET,
};

let fetchMock: ReturnType<typeof vi.fn>;

/** Answers each call in turn; records the URL and parsed body of each. */
function answer(...replies: Reply[]) {
  for (const next of replies) fetchMock.mockResolvedValueOnce(reply(next));
}

function calls(): { url: string; method: string; body: unknown }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    body: (init as RequestInit | undefined)?.body
      ? JSON.parse(String((init as RequestInit).body))
      : undefined,
  }));
}

beforeEach(() => {
  env.SUPABASE_URL = STORAGE;
  env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests-only';
  env.SUPABASE_STORAGE_BUCKET = 'media';
  env.SUPABASE_ID_BUCKET = 'ids';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  overrideIdStorageReady(null);
});

afterEach(() => {
  env.SUPABASE_URL = original.url;
  env.SUPABASE_SERVICE_ROLE_KEY = original.key;
  env.SUPABASE_STORAGE_BUCKET = original.media;
  env.SUPABASE_ID_BUCKET = original.ids;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  overrideIdStorageReady(null);
});

describe('listObjects', () => {
  it('lists the media bucket by default', async () => {
    answer({ body: [] });

    await listObjects('');

    expect(calls()[0]?.url).toBe(`${STORAGE}/storage/v1/object/list/media`);
  });

  it('carries the bucket into every folder it recurses into, with size and type', async () => {
    answer(
      { body: [{ name: 'ids', id: null, updated_at: null, metadata: null }] },
      { body: [{ name: 'user-1', id: null, updated_at: null, metadata: null }] },
      {
        body: [
          {
            name: 'a-front.webp',
            id: 'obj-1',
            updated_at: '2026-10-11T07:32:35.187Z',
            metadata: { size: 12, mimetype: 'image/webp' },
          },
        ],
      },
    );

    const objects = await listObjects('', 'ids');

    expect(calls().map((call) => call.url)).toEqual([
      `${STORAGE}/storage/v1/object/list/ids`,
      `${STORAGE}/storage/v1/object/list/ids`,
      `${STORAGE}/storage/v1/object/list/ids`,
    ]);
    expect(calls().map((call) => (call.body as { prefix: string }).prefix)).toEqual([
      '',
      'ids/',
      'ids/user-1/',
    ]);
    expect(objects).toEqual([
      {
        name: 'ids/user-1/a-front.webp',
        updatedAt: '2026-10-11T07:32:35.187Z',
        size: 12,
        mimetype: 'image/webp',
      },
    ]);
  });
});

describe('createSignedDownload', () => {
  it('asks for the given lifetime and returns an absolute URL', async () => {
    answer({ body: { signedURL: `/object/sign/ids/${ID_KEY}?token=t0k3n` } });

    const url = await createSignedDownload('ids', ID_KEY, 300);

    expect(calls()[0]).toEqual({
      url: `${STORAGE}/storage/v1/object/sign/ids/${ID_KEY}`,
      method: 'POST',
      body: { expiresIn: 300 },
    });
    expect(url).toBe(`${STORAGE}/storage/v1/object/sign/ids/${ID_KEY}?token=t0k3n`);
  });

  it('refuses a response without a relative URL', async () => {
    answer({ body: { signedURL: 'https://elsewhere.test/x' } });

    await expect(createSignedDownload('ids', ID_KEY, 300)).rejects.toMatchObject({
      status: 502,
      code: 'STORAGE_ERROR',
    });
  });
});

describe('logging an object key', () => {
  it('never logs a key from the ID bucket', async () => {
    const logged = vi.spyOn(logger, 'error');
    const refusal = { status: 400, body: { statusCode: '404', code: 'NoSuchKey' } };
    answer(refusal, refusal);

    await expect(createSignedDownload('ids', ID_KEY, 300)).rejects.toMatchObject({ status: 502 });
    await expect(createSignedUpload(ID_KEY, 'ids')).rejects.toMatchObject({ status: 502 });

    expect(logged).toHaveBeenCalledTimes(2);
    const written = JSON.stringify(logged.mock.calls);
    expect(written).not.toContain(ID_KEY);
    expect(written).not.toContain('0b6f1d2e');
    expect(written).toContain('[id object]');
  });

  it('still logs a media key, which is needed to diagnose a failed upload', async () => {
    const logged = vi.spyOn(logger, 'error');
    answer({ status: 400, body: { statusCode: '403', code: 'Unauthorized' } });

    await expect(createSignedUpload('avatars/u/x.webp')).rejects.toMatchObject({ status: 502 });

    expect(JSON.stringify(logged.mock.calls)).toContain('avatars/u/x.webp');
  });
});

describe('idObjectKey', () => {
  it("puts the photo under the account's own prefix, named for its side", () => {
    expect(idObjectKey('user-1', 'front', 'webp')).toMatch(
      /^ids\/user-1\/[0-9a-f-]{36}-front\.webp$/,
    );
    expect(idObjectKey('user-1', 'back', 'jpg')).toMatch(/^ids\/user-1\/[0-9a-f-]{36}-back\.jpg$/);
  });
});

describe('idStorageReady', () => {
  const privateBucket = {
    id: 'ids',
    public: false,
    file_size_limit: 10485760,
    allowed_mime_types: ['image/webp', 'image/jpeg'],
  };

  it('is ready for a private bucket with both limits', async () => {
    answer({ body: privateBucket });

    expect(await idStorageReady()).toBe(true);
    expect(calls()[0]?.url).toBe(`${STORAGE}/storage/v1/bucket/ids`);
  });

  it('is not ready for a public bucket', async () => {
    answer({ body: { ...privateBucket, public: true } });

    expect(await idStorageReady()).toBe(false);
  });

  it('is not ready for a missing bucket', async () => {
    answer({ status: 400, body: { statusCode: '404', code: 'NoSuchBucket' } });

    expect(await idStorageReady()).toBe(false);
  });

  it('is not ready without a size limit or a type list', async () => {
    answer({ body: { ...privateBucket, file_size_limit: null } });
    expect(await idStorageReady()).toBe(false);

    overrideIdStorageReady(null);
    answer({ body: { ...privateBucket, allowed_mime_types: [] } });
    expect(await idStorageReady()).toBe(false);
  });

  it('is not ready when storage cannot be reached, and asks nothing when unconfigured', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    expect(await idStorageReady()).toBe(false);

    overrideIdStorageReady(null);
    env.SUPABASE_URL = undefined;
    fetchMock.mockClear();
    expect(await idStorageReady()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remembers its answer instead of asking on every request', async () => {
    answer({ body: privateBucket });

    expect(await idStorageReady()).toBe(true);
    expect(await idStorageReady()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('keeping ID photos in the ID bucket', () => {
  it('refuses an ID key sent to the media bucket by a forgotten argument, before asking storage', async () => {
    await expect(createSignedUpload(ID_KEY)).rejects.toMatchObject({ status: 500, code: 'STORAGE_MISUSE' });
    await expect(deleteObject(ID_KEY)).rejects.toMatchObject({ status: 500, code: 'STORAGE_MISUSE' });
    expect(() => publicUrl(ID_KEY)).toThrow(expect.objectContaining({ code: 'STORAGE_MISUSE' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses anything but an ID key in the ID bucket', async () => {
    await expect(createSignedUpload('avatars/u/x.webp', 'ids')).rejects.toMatchObject({
      code: 'STORAGE_MISUSE',
    });
    await expect(createSignedDownload('ids', 'offers/p/x.webp', 60)).rejects.toMatchObject({
      code: 'STORAGE_MISUSE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not echo the key it refused', async () => {
    const refusal = await createSignedUpload(ID_KEY).catch((error: Error) => error);
    expect(String((refusal as Error).message)).not.toContain('0b6f1d2e');
  });

  it('keeps an ID key out of the log even when a misrouted delete is swallowed', async () => {
    const warned = vi.spyOn(logger, 'warn');

    await discardObject(ID_KEY);

    expect(warned).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warned.mock.calls)).not.toContain('0b6f1d2e');
  });
});

describe('signed downloads have their own limits', () => {
  it(`refuses a lifetime outside 1 to ${SIGNED_DOWNLOAD_MAX_SECONDS} seconds, before asking storage`, async () => {
    for (const expiresIn of [0, -5, 1.5, SIGNED_DOWNLOAD_MAX_SECONDS + 1, 86_400]) {
      await expect(createSignedDownload('ids', ID_KEY, expiresIn)).rejects.toMatchObject({
        code: 'STORAGE_MISUSE',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a key that climbs out of its folder', async () => {
    await expect(
      createSignedDownload('ids', 'ids/user-1/../user-2/x-front.webp', 60),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("storage's own error text", () => {
  it('has an ID key cut out before it is logged', async () => {
    const logged = vi.spyOn(logger, 'error');
    answer({
      status: 400,
      body: { statusCode: '400', code: 'InvalidKey', message: `Invalid key: ${ID_KEY}` },
    });

    await expect(createSignedDownload('ids', ID_KEY, 60)).rejects.toMatchObject({ status: 502 });

    const written = JSON.stringify(logged.mock.calls);
    expect(written).not.toContain('0b6f1d2e');
    expect(written).toContain('InvalidKey');
  });
});

describe('the upload pipeline (plan 0057)', () => {
  const AUDIO_KEY = 'offers/profile-1/0b6f1d2e-0000-4000-8000-000000000002.mp3';

  it('returns the sign response\'s token with the upload URL', async () => {
    answer({ body: { url: `/object/upload/sign/media-audio/${AUDIO_KEY}?token=t0k3n`, token: 't0k3n' } });

    const signed = await createSignedUpload(AUDIO_KEY, 'media-audio');

    expect(calls()[0]?.url).toBe(`${STORAGE}/storage/v1/object/upload/sign/media-audio/${AUDIO_KEY}`);
    expect(signed).toEqual({
      uploadUrl: `${STORAGE}/storage/v1/object/upload/sign/media-audio/${AUDIO_KEY}?token=t0k3n`,
      objectKey: AUDIO_KEY,
      token: 't0k3n',
    });
  });

  it('builds a public URL in the bucket it is given, and the media bucket by default', () => {
    expect(publicUrl(AUDIO_KEY, 'media-audio')).toBe(`${STORAGE}/storage/v1/object/public/media-audio/${AUDIO_KEY}`);
    expect(publicUrl('offers/p/x.webp')).toBe(`${STORAGE}/storage/v1/object/public/media/offers/p/x.webp`);
  });

  it('discards from the bucket it is given', async () => {
    answer({ body: { message: 'Successfully deleted' } });

    await discardObject('offers/p/x.mp4', 'media-video');

    expect(calls()[0]).toMatchObject({
      url: `${STORAGE}/storage/v1/object/media-video/offers/p/x.mp4`,
      method: 'DELETE',
    });
  });

  it('finds a stored object by listing its folder, with its real size and type', async () => {
    answer({
      body: [
        { name: 'other.mp3', id: 'a', updated_at: '2026-10-12T00:00:00Z', metadata: { size: 1, mimetype: 'audio/mpeg' } },
        {
          name: '0b6f1d2e-0000-4000-8000-000000000002.mp3',
          id: 'b',
          updated_at: '2026-10-12T00:00:00Z',
          metadata: { size: 500000, mimetype: 'audio/mpeg' },
        },
      ],
    });

    const object = await storedObject('media-audio', AUDIO_KEY);

    expect(calls()[0]?.url).toBe(`${STORAGE}/storage/v1/object/list/media-audio`);
    expect(calls()[0]?.body).toMatchObject({ prefix: 'offers/profile-1/' });
    expect(object).toEqual({ name: AUDIO_KEY, updatedAt: '2026-10-12T00:00:00Z', size: 500000, mimetype: 'audio/mpeg' });
  });

  it('answers null for an object that is not stored', async () => {
    answer({ body: [] });

    expect(await storedObject('media-audio', AUDIO_KEY)).toBeNull();
  });

  it('reads exactly the first 64 bytes, asking for a range', async () => {
    const body = new Uint8Array(200).map((_, index) => index);
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 206 }));

    const bytes = await readFirstBytes('media-audio', AUDIO_KEY);

    expect(bytes.length).toBe(64);
    expect(bytes[0]).toBe(0);
    expect(bytes[63]).toBe(63);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${STORAGE}/storage/v1/object/authenticated/media-audio/${AUDIO_KEY}`);
    expect((init.headers as Record<string, string>).Range).toBe('bytes=0-63');
  });

  it('fails a range read storage refuses', async () => {
    answer({ status: 400, body: { statusCode: '404', code: 'NoSuchKey' } });

    await expect(readFirstBytes('media-audio', AUDIO_KEY)).rejects.toMatchObject({
      status: 502,
      code: 'STORAGE_ERROR',
    });
  });

  it('sends resumable uploads to the project URL, with or without a trailing slash', () => {
    env.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
    expect(tusEndpoint()).toBe('https://abcdefghijklmnopqrst.supabase.co/storage/v1/upload/resumable/sign');

    env.SUPABASE_URL = 'http://127.0.0.1:54321/';
    expect(tusEndpoint()).toBe('http://127.0.0.1:54321/storage/v1/upload/resumable/sign');
  });

  it("reads a bucket's settings", async () => {
    answer({
      body: { id: 'media-audio', public: true, file_size_limit: 15000000, allowed_mime_types: ['audio/mpeg'] },
    });

    expect(await bucketSettings('media-audio')).toEqual({
      public: true,
      fileSizeLimit: 15000000,
      allowedMimeTypes: ['audio/mpeg'],
    });
    expect(calls()[0]?.url).toBe(`${STORAGE}/storage/v1/bucket/media-audio`);
  });

  it('answers null for a bucket that does not exist', async () => {
    answer({ status: 400, body: { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' } });

    expect(await bucketSettings('media-video')).toBeNull();
  });

  it('creates a missing bucket and updates one that exists', async () => {
    answer({ body: { name: 'media-video' } }, { body: { message: 'Successfully updated' } });
    const settings = { public: true, fileSizeLimit: 50000000, allowedMimeTypes: ['video/mp4', 'video/webm'] };

    await saveBucket('media-video', settings, false);
    await saveBucket('media-video', settings, true);

    expect(calls()).toEqual([
      {
        url: `${STORAGE}/storage/v1/bucket`,
        method: 'POST',
        body: {
          id: 'media-video',
          name: 'media-video',
          public: true,
          file_size_limit: 50000000,
          allowed_mime_types: ['video/mp4', 'video/webm'],
        },
      },
      {
        url: `${STORAGE}/storage/v1/bucket/media-video`,
        method: 'PUT',
        body: { public: true, file_size_limit: 50000000, allowed_mime_types: ['video/mp4', 'video/webm'] },
      },
    ]);
  });

  it('puts media and posters under the offer prefix', () => {
    expect(offerMediaKey('profile-1', 'm4a')).toMatch(/^offers\/profile-1\/[0-9a-f-]{36}\.m4a$/);
    expect(offerPosterKey('profile-1')).toMatch(/^offers\/profile-1\/[0-9a-f-]{36}-poster\.webp$/);
  });
});

describe('idStorageReady over time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks again within a minute, so a bucket made public stops ID uploads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
    const privateBucket = {
      id: 'ids',
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ['image/webp', 'image/jpeg'],
    };
    answer({ body: privateBucket }, { body: { ...privateBucket, public: true } });

    expect(await idStorageReady()).toBe(true);
    vi.setSystemTime(new Date('2026-10-11T00:01:01Z'));
    expect(await idStorageReady()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
