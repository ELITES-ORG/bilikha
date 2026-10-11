import { and, desc, eq, inArray, isNull, not, or } from 'drizzle-orm';
import type {
  IdUploadTicket,
  OwnIdVerification,
} from '../../contracts/verification.js';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { idVerifications, type IdVerification } from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import {
  assertSafeObjectKey,
  createSignedUpload,
  idObjectKey,
  idStorageReady,
  listObjects,
} from '../../lib/storage.js';
import { ID_TYPES } from './id-types.js';
import type { SubmissionInput } from './verification.schema.js';

/**
 * The account side of ID verification (ADR 0057, plan 0053 Phase 2).
 *
 * An account's state is its latest row. No row means no verification is
 * required — every account that existed before this shipped — and nothing here
 * may treat that as pending.
 */

/** The bucket enforces 10 MB on upload; this re-checks what actually landed. */
const ID_MAX_BYTES = 10 * 1024 * 1024;

const MIME_FOR_EXTENSION = { webp: 'image/webp', jpg: 'image/jpeg' } as const;

export async function latestIdVerification(userId: string): Promise<IdVerification | null> {
  const [row] = await db
    .select()
    .from(idVerifications)
    .where(eq(idVerifications.userId, userId))
    .orderBy(desc(idVerifications.createdAt))
    .limit(1);
  return row ?? null;
}

/** What the account may know about its own verification: never a key or a URL. */
export function ownView(row: IdVerification | null): OwnIdVerification | null {
  if (!row) return null;
  const declined =
    row.status === 'declined_retry' || row.status === 'declined_final' || row.status === 'appealed';
  return {
    status: row.status,
    submitted: row.submittedAt !== null,
    reason: declined ? row.decisionReason : null,
  };
}

/**
 * Whether the account may send photos now: an open row still waiting for them,
 * or a *try again* decline, which a new submission replaces.
 */
function acceptsSubmission(row: IdVerification): boolean {
  return (row.status === 'pending' && row.submittedAt === null) || row.status === 'declined_retry';
}

function refuseUnlessOpen(row: IdVerification | null): asserts row is IdVerification {
  if (!row) {
    throw AppError.conflict('This account does not need to verify an ID.');
  }
  if (!acceptsSubmission(row)) {
    throw AppError.conflict(
      row.status === 'pending'
        ? 'Your ID is already submitted and waiting for review.'
        : 'Your ID cannot be submitted again.',
    );
  }
}

async function requireIdStorage(): Promise<void> {
  if (!(await idStorageReady())) {
    throw new AppError(
      503,
      'ID_STORAGE_UNAVAILABLE',
      'ID uploads are unavailable right now. Try again in a few minutes.',
    );
  }
}

export async function createIdUploadUrl(
  userId: string,
  side: 'front' | 'back',
  contentType: 'image/webp' | 'image/jpeg',
): Promise<IdUploadTicket> {
  refuseUnlessOpen(await latestIdVerification(userId));
  await requireIdStorage();

  const objectKey = idObjectKey(userId, side, contentType === 'image/jpeg' ? 'jpg' : 'webp');
  const { uploadUrl } = await createSignedUpload(objectKey, env.SUPABASE_ID_BUCKET);
  return { uploadUrl, objectKey };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Checks one submitted key, returning its extension. The key arrives from the
 * client, so nothing about it is trusted: its shape, its owner, its side, and
 * later whether the object is really there.
 */
function checkKey(userId: string, key: string, side: 'front' | 'back'): keyof typeof MIME_FOR_EXTENSION {
  assertSafeObjectKey(key);

  if (!key.startsWith(`ids/${userId}/`)) {
    throw AppError.forbidden('That photo does not belong to this account.');
  }

  const match = new RegExp(`^ids/${userId}/${UUID}-(front|back)\\.(webp|jpg)$`).exec(key);
  if (!match) {
    throw AppError.badRequest('That photo was not uploaded through Bilikha. Upload it again.');
  }
  if (match[1] !== side) {
    throw AppError.badRequest(`Upload the ${side} of the ID as its ${side}.`);
  }
  return match[2] as keyof typeof MIME_FOR_EXTENSION;
}

/** Postgres 23505, found on the error or its `cause` (Drizzle wraps the driver's). */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== 'object') return false;
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function submitId(userId: string, input: SubmissionInput): Promise<OwnIdVerification> {
  const latest = await latestIdVerification(userId);
  refuseUnlessOpen(latest);

  const sides: { key: string; extension: keyof typeof MIME_FOR_EXTENSION }[] = [
    { key: input.frontKey, extension: checkKey(userId, input.frontKey, 'front') },
  ];

  const { hasBack } = ID_TYPES[input.idType];
  if (hasBack && !input.backKey) {
    throw AppError.badRequest('This ID is a card: upload its back as well as its front.');
  }
  if (!hasBack && input.backKey) {
    throw AppError.badRequest('This ID has no back. Upload its front only.');
  }
  if (input.backKey) {
    sides.push({ key: input.backKey, extension: checkKey(userId, input.backKey, 'back') });
  }

  // A photo already on any row — an earlier submission's, declined — cannot be
  // reused: each submission is reviewed on its own photos. The account's own
  // open row is left out: it holds these photos only if a second, identical
  // submission is racing this one, and the guarded write below answers that
  // with 409 rather than this with 400.
  const keys = sides.map((side) => side.key);
  const [reused] = await db
    .select({ id: idVerifications.id })
    .from(idVerifications)
    .where(
      and(
        or(inArray(idVerifications.frontKey, keys), inArray(idVerifications.backKey, keys)),
        not(and(eq(idVerifications.userId, userId), eq(idVerifications.status, 'pending'))!),
      ),
    )
    .limit(1);
  if (reused) {
    throw AppError.badRequest('That photo was already submitted. Take a new one.');
  }

  await requireIdStorage();
  const stored = await listObjects(`ids/${userId}/`, env.SUPABASE_ID_BUCKET);
  for (const side of sides) {
    const object = stored.find((candidate) => candidate.name === side.key);
    if (!object) {
      throw AppError.badRequest('A photo did not finish uploading. Upload it again.');
    }
    if (object.size === null || object.size > ID_MAX_BYTES) {
      throw AppError.badRequest('A photo is larger than 10 MB. Upload it again.');
    }
    if (object.mimetype !== MIME_FOR_EXTENSION[side.extension]) {
      throw AppError.badRequest('A photo is not a JPEG or WebP image. Upload it again.');
    }
  }

  const now = new Date();
  const fields = {
    idType: input.idType,
    frontKey: input.frontKey,
    backKey: input.backKey ?? null,
    idConsentAt: now,
    submittedAt: now,
    updatedAt: now,
  };

  let row: IdVerification | undefined;
  if (latest.status === 'pending') {
    // Guarded on the row still being open, so two submissions racing for it
    // cannot both land: the second updates nothing.
    [row] = await db
      .update(idVerifications)
      .set(fields)
      .where(
        and(
          eq(idVerifications.id, latest.id),
          eq(idVerifications.status, 'pending'),
          isNull(idVerifications.submittedAt),
        ),
      )
      .returning();
  } else {
    // After *try again*, a new row: the declined one keeps its own decision.
    try {
      [row] = await db
        .insert(idVerifications)
        .values({ userId, status: 'pending', ...fields })
        .returning();
    } catch (error) {
      // One open submission per account (id_verifications_one_open_idx).
      if (isUniqueViolation(error)) row = undefined;
      else throw error;
    }
  }

  if (!row) {
    throw AppError.conflict('Your ID is already submitted and waiting for review.');
  }
  return ownView(row)!;
}
