import { randomInt } from 'node:crypto';

/**
 * No `0`/`O`, no `1`/`l`/`I`, no `5`/`S`, no `2`/`Z`.
 *
 * An administrator reads this down a phone line or writes it on a slip of
 * paper for someone standing at a desk (ADR 0051). Every character that can be
 * misheard or miscopied is a support call, so the alphabet is reduced rather
 * than maximised — the length carries the entropy instead.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnopqrstuvwxyz346789';

/** 16 from this alphabet is ~91 bits, well past what argon2 needs to hold. */
const LENGTH = 16;

/**
 * A temporary password for an administrator-initiated reset.
 *
 * `randomInt` rather than `Math.random`: this is a credential, and it is the
 * only thing standing in front of someone else's account between the reset and
 * their next sign-in.
 *
 * Grouped in fours. Nothing parses the hyphens — they exist so a human can
 * keep their place while reading it out, and `POST /api/v1/me/password` takes
 * the string exactly as shown.
 */
export function generateTemporaryPassword(): string {
  let out = '';

  for (let i = 0; i < LENGTH; i += 1) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += ALPHABET[randomInt(ALPHABET.length)];
  }

  return out;
}

export const TEMPORARY_PASSWORD_ALPHABET = ALPHABET;
export const TEMPORARY_PASSWORD_LENGTH = LENGTH;
