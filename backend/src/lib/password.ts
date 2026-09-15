import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id at OWASP's recommended second-choice parameters (19 MiB, t=2, p=1).
 * Verification reads parameters from the stored hash, so raising these later
 * does not invalidate existing passwords.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    // A malformed hash must read as a failed login, never as a crash.
    return false;
  }
}
