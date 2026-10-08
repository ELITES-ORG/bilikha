import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { hashPassword } from '../lib/password.js';
import { normalizeUsername } from '../lib/username.js';

/**
 * Sprint 1 has no self-service password reset (ADR 0013).
 *
 * **The recovery path is now the admin area** — Accounts → Reset password,
 * which issues a temporary password, revokes the account's sessions and records
 * who did it (ADR 0051). Prefer it: it needs no database credentials and leaves
 * a trail.
 *
 * This script stays for the two cases that screen cannot serve: the first
 * administrator, who has nobody to reset their password, and an environment
 * broken enough that the admin area is unreachable. It writes no audit row and
 * does not force a change, so the password it sets is permanent until someone
 * changes it.
 *
 * Verify the person's identity out of band before running it.
 *
 *   npm --prefix backend run admin:reset-password -- <username> <new-password>
 */
const [username, newPassword] = process.argv.slice(2);

if (!username || !newPassword) {
  console.error('Usage: npm run admin:reset-password -- <username> <new-password>');
  process.exit(1);
}

if (newPassword.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const result = await db
  .update(users)
  .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
  .where(eq(users.usernameNormalized, normalizeUsername(username)))
  .returning({ id: users.id, username: users.username });

if (result.length === 0) {
  console.error(`No user with username "${username}".`);
  await closeDatabase();
  process.exit(1);
}

console.log(`Password reset for ${result[0]!.username}.`);
await closeDatabase();
process.exit(0);
