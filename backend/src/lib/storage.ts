import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './http-error.js';
import { logger } from './logger.js';

/**
 * Supabase Storage contract — pinned with curl against the live project in
 * plan 0009 Step 2.4. Observation wins over docs.
 *
 * Sign:
 *   POST {SUPABASE_URL}/storage/v1/object/upload/sign/{bucket}/{objectKey}
 *   Authorization: Bearer {SERVICE_ROLE_KEY}
 *   → 200 { url: "/object/upload/sign/...?token=...", token: "..." }
 *   Absolute upload URL = {SUPABASE_URL}/storage/v1 + url
 *
 * Upload (browser):
 *   PUT {absolute upload URL}
 *   Content-Type: image/webp (or image/jpeg)
 *   → 200 { Key: "{bucket}/{objectKey}" }
 *
 * Public read:
 *   GET {SUPABASE_URL}/storage/v1/object/public/{bucket}/{objectKey}
 *   → 200 image bytes (no auth)
 *
 * Delete:
 *   DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{objectKey}
 *   Authorization: Bearer {SERVICE_ROLE_KEY}
 *   → 200 { message: "Successfully deleted" }
 *
 * Missing object (public GET or DELETE):
 *   Body { statusCode: "404", code: "NoSuchKey", ... } with HTTP 400
 *   (not HTTP 404). deleteObject treats that as already-gone.
 *
 * Pinned with curl against local Supabase in plan 0053 Step 1.4:
 *
 * Signed download (private bucket):
 *   POST {SUPABASE_URL}/storage/v1/object/sign/{bucket}/{objectKey}
 *   Authorization: Bearer {SERVICE_ROLE_KEY}
 *   Content-Type: application/json
 *   { "expiresIn": 300 }
 *   → 200 { signedURL: "/object/sign/{bucket}/{objectKey}?token=..." }
 *   Absolute URL = {SUPABASE_URL}/storage/v1 + signedURL; GET it → 200 bytes.
 *   A missing object → HTTP 400 { statusCode: "404", code: "NoSuchKey" }.
 *
 * List: each object carries metadata { size, mimetype, ... }; a folder comes
 *   back with id, updated_at and metadata all null.
 *
 * Bucket:
 *   GET {SUPABASE_URL}/storage/v1/bucket/{id}
 *   → 200 { id, public, file_size_limit, allowed_mime_types, ... }
 *   A missing bucket → HTTP 400 { statusCode: "404", code: "NoSuchBucket" }.
 *
 * Probed against staging in plan 0057 Step 0.1:
 *
 * Resumable upload (TUS), authorised by the sign response's token:
 *   POST {SUPABASE_URL}/storage/v1/upload/resumable/sign
 *   x-signature: {token}
 *   Upload-Metadata: bucketName, objectName, contentType, cacheControl
 *   Chunks of exactly 6 MiB. An interrupted upload resumes from the last
 *   accepted chunk. Over the bucket's size limit → 413 at creation.
 *
 * Range read:
 *   GET {SUPABASE_URL}/storage/v1/object/authenticated/{bucket}/{objectKey}
 *   Authorization: Bearer {SERVICE_ROLE_KEY}
 *   Range: bytes=0-63
 *   → 206 with the first 64 bytes.
 */

/** False when the storage env vars are absent. Images are then disabled and the
 *  rest of the API carries on — see the note in config/env.ts. */
export function isStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The anon and service_role keys are both JWTs beginning `eyJ`, the same
 * length, and sit next to each other in the dashboard. Pasting the wrong one
 * fails only at the first upload, as an HTTP 400 that says nothing useful.
 * The role is in the (unsigned) payload, so it can be checked at boot.
 * Returns null when there is no key, or it is not a decodable JWT.
 */
export function storageKeyClaims(): { role: string | null; ref: string | null } {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { role: null, ref: null };
  try {
    const payload = key.split('.')[1];
    if (!payload) return { role: null, ref: null };
    const claims = JSON.parse(Buffer.from(payload, 'base64').toString()) as {
      role?: string;
      ref?: string;
    };
    return { role: claims.role ?? null, ref: claims.ref ?? null };
  } catch {
    return { role: null, ref: null };
  }
}

/** The project ref is the first label of the Supabase hostname. */
export function projectRefFromUrl(): string | null {
  if (!env.SUPABASE_URL) return null;
  try {
    return new URL(env.SUPABASE_URL).hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

function requireStorage(): { url: string; key: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(
      503,
      'STORAGE_UNCONFIGURED',
      'Image uploads are unavailable right now.',
    );
  }
  return { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
}

const storageBase = () => `${requireStorage().url.replace(/\/$/, '')}/storage/v1`;

const serviceHeaders = (): Record<string, string> => {
  const { key } = requireStorage();
  return { Authorization: `Bearer ${key}`, apikey: key };
};

/**
 * Object keys reach us from the client, and every ownership check in the media
 * module is a `startsWith` on a prefix. A key like
 * `offers/<own-id>/../../avatars/<victim-id>/x.webp` passes that check, and
 * both `new URL()` and fetch then resolve the dot segments away — so the
 * request lands on someone else's object. Reject anything that is not a plain
 * segment before the key is ever trusted or used to build a URL.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function assertSafeObjectKey(objectKey: string): void {
  const segments = objectKey.split('/');

  if (segments.length < 2) {
    throw AppError.badRequest('Invalid image key');
  }

  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment)) {
      throw AppError.badRequest('Invalid image key');
    }
  }
}

/** Every ID photo's key starts with this, and nothing else's does. */
const ID_KEY_PREFIX = 'ids/';

const isIdBucket = (bucket: string) => bucket === env.SUPABASE_ID_BUCKET;

/**
 * An ID's object key names the account it belongs to, and a log line is read by
 * more people than an administrator. Keys in the ID bucket — or shaped like an
 * ID key wherever they turn up — never reach a log.
 */
function loggableKey(bucket: string, objectKey: string): string {
  return isIdBucket(bucket) || objectKey.startsWith(ID_KEY_PREFIX) ? '[id object]' : objectKey;
}

/**
 * Storage's error body, for a log line. Supabase can quote the key it refused
 * ("Invalid key: ids/…"), so for an ID the key is cut out of the body too, raw
 * and URL-encoded.
 */
function loggableBody(bucket: string, objectKey: string, body: string): string {
  const text = body.slice(0, 500);
  if (loggableKey(bucket, objectKey) === objectKey) return text;
  return text.split(objectKey).join('[id object]').split(encodeObjectKey(objectKey)).join('[id object]');
}

/**
 * ID photos go only to the private ID bucket, and nothing else goes there. The
 * helpers default to the public media bucket, so without this a call that
 * forgot its bucket argument would put a government ID where anyone can read
 * it (ADR 0057). A programming error, so a 500 — and the key is not echoed.
 */
function assertBucketFitsKey(bucket: string, objectKey: string): void {
  if (objectKey.startsWith(ID_KEY_PREFIX) !== isIdBucket(bucket)) {
    throw new AppError(500, 'STORAGE_MISUSE', 'An image was sent to the wrong storage bucket.');
  }
}

/** The longest a signed read of a private object may live (plan 0053, ADR 0060). */
export const SIGNED_DOWNLOAD_MAX_SECONDS = 300;

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function createSignedUpload(
  objectKey: string,
  bucket: string = env.SUPABASE_STORAGE_BUCKET,
): Promise<{ uploadUrl: string; objectKey: string; token: string }> {
  assertSafeObjectKey(objectKey);
  assertBucketFitsKey(bucket, objectKey);
  const path = `${storageBase()}/object/upload/sign/${encodeURIComponent(bucket)}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(path, {
    method: 'POST',
    headers: serviceHeaders(),
  });

  if (!response.ok) {
    // Storage reports most failures as HTTP 400 with the real code in the body
    // — an unauthorised key and a missing bucket both arrive that way. Without
    // logging the body there is nothing to diagnose from, and it does not
    // belong in the client response.
    const body = await response.text();
    logger.error(
      { status: response.status, body: loggableBody(bucket, objectKey, body), objectKey: loggableKey(bucket, objectKey) },
      'Supabase refused to sign an upload',
    );
    throw new AppError(502, 'STORAGE_ERROR', 'Could not prepare the upload. Try again.');
  }

  const payload = (await response.json()) as { url?: string; token?: string };
  if (!payload.url || !payload.url.startsWith('/')) {
    throw new AppError(502, 'STORAGE_ERROR', 'Storage sign response was missing a relative url');
  }
  // The resumable upload is authorised by the token alone (plan 0057 Step 0.1).
  if (!payload.token) {
    throw new AppError(502, 'STORAGE_ERROR', 'Storage sign response was missing a token');
  }

  return {
    uploadUrl: `${storageBase()}${payload.url}`,
    objectKey,
    token: payload.token,
  };
}

/**
 * A URL that reads one object from a private bucket for `expiresIn` seconds:
 * an ID photo, to administrators (ADR 0057), or a message file, to the two
 * people in its conversation (ADR 0060). Never logged, never stored. The
 * five-minute ceiling is enforced here rather than trusted to every caller.
 */
export async function createSignedDownload(
  bucket: string,
  objectKey: string,
  expiresIn: number,
): Promise<string> {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > SIGNED_DOWNLOAD_MAX_SECONDS) {
    throw new AppError(500, 'STORAGE_MISUSE', `A signed download lasts 1 to ${SIGNED_DOWNLOAD_MAX_SECONDS} seconds.`);
  }
  assertSafeObjectKey(objectKey);
  assertBucketFitsKey(bucket, objectKey);
  const path = `${storageBase()}/object/sign/${encodeURIComponent(bucket)}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(path, {
    method: 'POST',
    headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error(
      { status: response.status, body: loggableBody(bucket, objectKey, body), objectKey: loggableKey(bucket, objectKey) },
      'Supabase refused to sign a download',
    );
    throw new AppError(502, 'STORAGE_ERROR', 'Could not read the image. Try again.');
  }

  const payload = (await response.json()) as { signedURL?: string };
  if (!payload.signedURL || !payload.signedURL.startsWith('/')) {
    throw new AppError(502, 'STORAGE_ERROR', 'Storage sign response was missing a relative url');
  }

  return `${storageBase()}${payload.signedURL}`;
}

export function publicUrl(objectKey: string, bucket: string = env.SUPABASE_STORAGE_BUCKET): string {
  // The media buckets are public; an ID key here would be a readable ID.
  assertBucketFitsKey(bucket, objectKey);
  return `${storageBase()}/object/public/${bucket}/${encodeObjectKey(objectKey)}`;
}

export async function deleteObject(
  objectKey: string,
  bucket: string = env.SUPABASE_STORAGE_BUCKET,
): Promise<void> {
  assertBucketFitsKey(bucket, objectKey);
  const path = `${storageBase()}/object/${encodeURIComponent(bucket)}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(path, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });

  if (response.ok) return;

  // Observed: missing objects return HTTP 400 with code NoSuchKey (not 404).
  let code: string | undefined;
  let statusCode: string | number | undefined;
  try {
    const body = (await response.json()) as {
      code?: string;
      statusCode?: string | number;
    };
    code = body.code;
    statusCode = body.statusCode;
  } catch {
    // non-JSON body — fall through to throw
  }

  if (code === 'NoSuchKey' || statusCode === '404' || statusCode === 404 || response.status === 404) {
    return;
  }

  throw new AppError(
    502,
    'STORAGE_ERROR',
    `Could not delete storage object (${response.status})`,
  );
}

/**
 * Delete an object that nothing refers to any more — a replaced or removed
 * image — without failing the request that let it go. The row has already
 * changed by then; refusing the request would not bring the reference back.
 * Anything left behind (storage down, or not configured, as in tests and on a
 * laptop) is found by `npm run media:prune`, which deletes unreferenced
 * objects older than a day.
 */
export async function discardObject(
  objectKey: string,
  bucket: string = env.SUPABASE_STORAGE_BUCKET,
): Promise<void> {
  if (!isStorageConfigured()) return;
  try {
    await deleteObject(objectKey, bucket);
  } catch (error) {
    logger.warn(
      { err: error, bucket, objectKey: loggableKey(bucket, objectKey) },
      'Could not delete a replaced image; media:prune will',
    );
  }
}

export interface StoredObject {
  name: string;
  updatedAt: string | null;
  /** Bytes, from the object's metadata; null when storage did not report it. */
  size: number | null;
  mimetype: string | null;
}

/** Lists objects under an optional prefix. Paginates until exhausted. */
export async function listObjects(
  prefix = '',
  bucket: string = env.SUPABASE_STORAGE_BUCKET,
): Promise<StoredObject[]> {
  const results: StoredObject[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const response = await fetch(`${storageBase()}/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: {
        ...serviceHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit, offset }),
    });

    if (!response.ok) {
      throw new AppError(502, 'STORAGE_ERROR', `Could not list storage objects (${response.status})`);
    }

    const batch = (await response.json()) as Array<{
      name: string;
      updated_at?: string | null;
      id?: string | null;
      metadata?: { size?: number; mimetype?: string } | null;
    }>;

    // Folders come back with id null and no updated_at — recurse into them.
    for (const entry of batch) {
      const path = prefix ? `${prefix}${entry.name}` : entry.name;
      if (entry.id == null && !entry.updated_at) {
        // The bucket must travel with the recursion, or a nested folder of
        // the ID bucket would be listed from the media bucket.
        const nested = await listObjects(`${path}/`, bucket);
        results.push(...nested);
      } else {
        results.push({
          name: path,
          updatedAt: entry.updated_at ?? null,
          size: typeof entry.metadata?.size === 'number' ? entry.metadata.size : null,
          mimetype: entry.metadata?.mimetype ?? null,
        });
      }
    }

    if (batch.length < limit) break;
    offset += limit;
  }

  return results;
}

/**
 * One object's stored size and type, or null when it is not there. Read from
 * the listing of its folder: the listing reports what storage actually holds,
 * whatever the uploader declared.
 */
export async function storedObject(bucket: string, objectKey: string): Promise<StoredObject | null> {
  assertSafeObjectKey(objectKey);
  assertBucketFitsKey(bucket, objectKey);
  const prefix = objectKey.slice(0, objectKey.lastIndexOf('/') + 1);
  const objects = await listObjects(prefix, bucket);
  return objects.find((object) => object.name === objectKey) ?? null;
}

/**
 * The first `count` bytes of a stored object, for checking its file signature.
 * Asks for a byte range and stops reading once it has enough, so a 300 MB video
 * costs 64 bytes. Fewer come back only when the object is shorter.
 */
export async function readFirstBytes(bucket: string, objectKey: string, count = 64): Promise<Uint8Array> {
  assertSafeObjectKey(objectKey);
  assertBucketFitsKey(bucket, objectKey);
  const path = `${storageBase()}/object/authenticated/${encodeURIComponent(bucket)}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(path, {
    headers: { ...serviceHeaders(), Range: `bytes=0-${count - 1}` },
  });

  if (response.status !== 200 && response.status !== 206) {
    const body = await response.text();
    logger.error(
      { status: response.status, body: loggableBody(bucket, objectKey, body), objectKey: loggableKey(bucket, objectKey) },
      'Supabase refused to read the start of an object',
    );
    throw new AppError(502, 'STORAGE_ERROR', 'Could not check the upload. Try again.');
  }

  const bytes = new Uint8Array(count);
  let filled = 0;
  const reader = response.body?.getReader();
  if (reader) {
    while (filled < count) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.length, count - filled);
      bytes.set(value.subarray(0, take), filled);
      filled += take;
    }
    await reader.cancel();
  }
  return bytes.slice(0, filled);
}

/** Where the browser sends a resumable upload, with the sign response's token. */
export function tusEndpoint(): string {
  return `${storageBase()}/upload/resumable/sign`;
}

export interface BucketSettings {
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
}

/** A bucket's settings, or null when there is no such bucket. */
export async function bucketSettings(bucket: string): Promise<BucketSettings | null> {
  const response = await fetch(`${storageBase()}/bucket/${encodeURIComponent(bucket)}`, {
    headers: serviceHeaders(),
  });

  if (response.ok) {
    const body = (await response.json()) as {
      public?: boolean;
      file_size_limit?: number | null;
      allowed_mime_types?: string[] | null;
    };
    return {
      public: body.public === true,
      fileSizeLimit: typeof body.file_size_limit === 'number' ? body.file_size_limit : null,
      allowedMimeTypes: Array.isArray(body.allowed_mime_types) ? body.allowed_mime_types : null,
    };
  }

  // Observed: a missing bucket answers HTTP 400, with 404 in the body.
  const text = await response.text();
  let body: { statusCode?: string | number; code?: string; error?: string; message?: string } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // non-JSON body — fall through to throw
  }
  if (
    response.status === 404
    || String(body.statusCode) === '404'
    || body.code === 'NoSuchBucket'
    || body.error === 'Bucket not found'
    || body.message === 'Bucket not found'
  ) {
    return null;
  }
  throw new AppError(502, 'STORAGE_ERROR', `Could not read bucket ${bucket} (${response.status}): ${text.slice(0, 200)}`);
}

/** Creates the bucket, or updates it when it exists. */
export async function saveBucket(
  id: string,
  settings: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] },
  exists: boolean,
): Promise<void> {
  const body = {
    ...(exists ? {} : { id, name: id }),
    public: settings.public,
    file_size_limit: settings.fileSizeLimit,
    allowed_mime_types: settings.allowedMimeTypes,
  };
  const response = await fetch(
    exists ? `${storageBase()}/bucket/${encodeURIComponent(id)}` : `${storageBase()}/bucket`,
    {
      method: exists ? 'PUT' : 'POST',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, 'STORAGE_ERROR', `Could not save bucket ${id} (${response.status}): ${text.slice(0, 200)}`);
  }
}

export const avatarKey = (userId: string) => `avatars/${userId}/${randomUUID()}.webp`;

export const organizationLogoKey = (organizationId: string) =>
  `organizations/${organizationId}/${randomUUID()}.webp`;

export const offerKey = (profileId: string) =>
  `offers/${profileId}/${randomUUID()}`; // caller appends .webp / -thumb.webp

/** A cover's base key; the caller appends `.webp` and `-768.webp` (ADR 0061). */
export const coverKey = (profileId: string) => `covers/${profileId}/${randomUUID()}`;

/** An offer's audio, video or PDF. Under the same prefix in whichever bucket it lives. */
export const offerMediaKey = (profileId: string, ext: string) => `offers/${profileId}/${randomUUID()}.${ext}`;

/** A video's poster, which lives in the image bucket. */
export const offerPosterKey = (profileId: string) => `offers/${profileId}/${randomUUID()}-poster.webp`;

/**
 * A message's file, under its conversation, in the private message buckets
 * (ADR 0060). Same shapes as an offer's: the caller appends `.webp` and
 * `-thumb.webp` to `messageKey`.
 */
export const messageKey = (conversationId: string) => `messages/${conversationId}/${randomUUID()}`;
export const messageMediaKey = (conversationId: string, ext: string) =>
  `messages/${conversationId}/${randomUUID()}.${ext}`;
export const messagePosterKey = (conversationId: string) =>
  `messages/${conversationId}/${randomUUID()}-poster.webp`;

/**
 * Where an ID photo goes in the ID bucket. The `ids/<userId>/` prefix is what
 * an upload is scoped to, and the side is in the name so a front can never be
 * submitted as a back.
 */
export const idObjectKey = (userId: string, side: 'front' | 'back', ext: 'webp' | 'jpg') =>
  `ids/${userId}/${randomUUID()}-${side}.${ext}`;

/**
 * Whether the ID bucket exists and is safe to put an ID in: private, with a
 * size limit and an allowed list of types, so the bucket itself refuses
 * anything else (ADR 0057). Uploads are refused while this is false.
 *
 * Cached for a minute either way: long enough not to ask storage on every
 * request, short enough that a bucket made public stops ID uploads within a
 * minute, and a transient storage error clears within one too.
 */
const ID_READY_TTL_MS = 60 * 1000;
let idReadyCache: { value: boolean; at: number } | null = null;
let idReadyOverride: boolean | null = null;

export async function idStorageReady(): Promise<boolean> {
  if (idReadyOverride !== null) return idReadyOverride;
  if (!isStorageConfigured()) return false;
  if (idReadyCache && Date.now() - idReadyCache.at < ID_READY_TTL_MS) return idReadyCache.value;

  let value = false;
  try {
    const response = await fetch(
      `${storageBase()}/bucket/${encodeURIComponent(env.SUPABASE_ID_BUCKET)}`,
      { headers: serviceHeaders() },
    );
    if (response.ok) {
      const bucket = (await response.json()) as {
        public?: boolean;
        file_size_limit?: number | null;
        allowed_mime_types?: string[] | null;
      };
      value =
        bucket.public === false
        && typeof bucket.file_size_limit === 'number'
        && bucket.file_size_limit > 0
        && Array.isArray(bucket.allowed_mime_types)
        && bucket.allowed_mime_types.length > 0;
    }
  } catch (error) {
    logger.warn({ err: error }, 'Could not check the ID bucket');
  }

  idReadyCache = { value, at: Date.now() };
  return value;
}

/** Tests only: force the answer, or `null` to clear the override and the cache. */
export function overrideIdStorageReady(value: boolean | null): void {
  idReadyOverride = value;
  idReadyCache = null;
}
