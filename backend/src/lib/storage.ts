import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from './http-error.js';

/**
 * Supabase Storage contract — pinned with curl in plan 0009 Step 2.4
 * against project hhtyeqaxqjqepxmdlhpq. Observation wins over docs.
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
 */

const storageBase = () => `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;

const serviceHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
});

/**
 * Object keys reach us from the client, and every ownership check in the media
 * module is a `startsWith` on a prefix. A key like
 * `portfolio/<own-id>/../../avatars/<victim-id>/x.webp` passes that check, and
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

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function createSignedUpload(
  objectKey: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const path = `${storageBase()}/object/upload/sign/${bucket}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(path, {
    method: 'POST',
    headers: serviceHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new AppError(
      502,
      'STORAGE_ERROR',
      `Could not create an upload URL (${response.status})`,
      body,
    );
  }

  const payload = (await response.json()) as { url?: string; token?: string };
  if (!payload.url || !payload.url.startsWith('/')) {
    throw new AppError(502, 'STORAGE_ERROR', 'Storage sign response was missing a relative url');
  }

  return {
    uploadUrl: `${storageBase()}${payload.url}`,
    objectKey,
  };
}

export function publicUrl(objectKey: string): string {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  return `${storageBase()}/object/public/${bucket}/${encodeObjectKey(objectKey)}`;
}

export async function deleteObject(objectKey: string): Promise<void> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const path = `${storageBase()}/object/${bucket}/${encodeObjectKey(objectKey)}`;

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

/** Lists object names under an optional prefix. Paginates until exhausted. */
export async function listObjects(prefix = ''): Promise<
  { name: string; updatedAt: string | null }[]
> {
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const results: { name: string; updatedAt: string | null }[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const response = await fetch(`${storageBase()}/object/list/${bucket}`, {
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
    }>;

    // Folders come back with id null and no updated_at — recurse into them.
    for (const entry of batch) {
      const path = prefix ? `${prefix}${entry.name}` : entry.name;
      if (entry.id == null && !entry.updated_at) {
        const nested = await listObjects(`${path}/`);
        results.push(...nested);
      } else {
        results.push({ name: path, updatedAt: entry.updated_at ?? null });
      }
    }

    if (batch.length < limit) break;
    offset += limit;
  }

  return results;
}

export const avatarKey = (userId: string) => `avatars/${userId}/${randomUUID()}.webp`;

export const portfolioKey = (profileId: string) =>
  `portfolio/${profileId}/${randomUUID()}`; // caller appends .webp / -thumb.webp
