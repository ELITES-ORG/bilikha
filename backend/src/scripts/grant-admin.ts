import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { normalizeUsername } from '../lib/username.js';

/**
 * Promotes an existing account to administrator. The only way to create the
 * first one — there is no admin to grant it through the UI.
 *
 *   npm --prefix backend run admin:grant -- <username>
 *
 * Run it deliberately. An admin can publish and reject any profile.
 */
const [username] = process.argv.slice(2);

if (!username) {
  console.error('Usage: npm run admin:grant -- <username>');
  process.exit(1);
}

const result = await db
  .update(users)
  .set({ role: 'admin', updatedAt: new Date() })
  .where(eq(users.usernameNormalized, normalizeUsername(username)))
  .returning({ username: users.username, role: users.role });

if (result.length === 0) {
  console.error(`No user with username "${username}". Register the account first.`);
  await closeDatabase();
  process.exit(1);
}

console.log(`${result[0]!.username} is now ${result[0]!.role}.`);
await closeDatabase();
process.exit(0);
