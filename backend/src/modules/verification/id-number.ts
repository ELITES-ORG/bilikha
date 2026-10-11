import { createHmac } from 'node:crypto';
import type { IdType } from '../../contracts/verification.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/http-error.js';

/**
 * Recognising a repeated ID (plan 0053, Decided 5).
 *
 * An administrator types the ID number from the photo. Only a keyed hash of it
 * is stored, and it outlives the photos, so an ID declined as *not from
 * Biliran* is recognised if it is used to register again.
 *
 * Keyed, not a plain hash: ID numbers are short, so an unkeyed hash could be
 * brute-forced back into the number by anyone holding a copy of the database.
 * The number itself is never stored, logged or returned.
 */

const MIN_LENGTH = 4;

/**
 * The same ID typed two ways must hash the same: "1234-5678 9012" and
 * "123456789012". NFKC folds full-width and other look-alike digits; only
 * letters and digits are kept.
 */
export function normalizeIdNumber(raw: string): string {
  return raw.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Whether a hash can be made at all. Deciding an ID answers 503 while it is false. */
export function idHashReady(secret: string | undefined = env.ID_HASH_SECRET): boolean {
  return Boolean(secret);
}

/**
 * HMAC-SHA256 over `<idType>:<normalised number>`, as hex. The type is part of
 * the input because two kinds of ID can share a number without being the same
 * document.
 */
export function hashIdNumber(
  idType: IdType,
  raw: string,
  secret: string | undefined = env.ID_HASH_SECRET,
): string {
  if (!secret) {
    throw new AppError(
      503,
      'ID_HASH_UNAVAILABLE',
      'ID numbers cannot be recorded right now. Try again later.',
    );
  }

  const number = normalizeIdNumber(raw);
  if (number.length < MIN_LENGTH) {
    throw AppError.badRequest('That ID number is too short. Check it against the photo.');
  }

  return createHmac('sha256', secret).update(`${idType}:${number}`).digest('hex');
}
