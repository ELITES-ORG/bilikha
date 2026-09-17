/**
 * Deletes read notifications older than 90 days.
 *
 * ADR 0030 names unbounded growth as a known cost of storing notifications
 * rather than deriving them. This is the answer to it, and it is a manual one:
 * a script that exists is not a solved problem, but a table with no prune path
 * at all is worse.
 *
 * Only *read* rows are removed. An unread notification is still something the
 * recipient has not seen, however old it is.
 *
 * Usage:
 *   npm --prefix backend run notifications:prune            # dry run
 *   npm --prefix backend run notifications:prune -- --commit
 */
import { and, count, isNotNull, lt } from 'drizzle-orm';
import { db, closeDatabase } from '../db/index.js';
import { notifications } from '../db/schema/index.js';

const AGE_DAYS = 90;

async function main() {
  const shouldCommit = process.argv.includes('--commit');
  const cutoff = new Date(Date.now() - AGE_DAYS * 24 * 60 * 60 * 1000);

  const where = and(isNotNull(notifications.readAt), lt(notifications.readAt, cutoff));

  const [row] = await db.select({ value: count() }).from(notifications).where(where);
  const total = row?.value ?? 0;

  console.log(`${total} read notification(s) older than ${AGE_DAYS} days.`);

  if (total === 0) return;

  if (!shouldCommit) {
    console.log('\nDry run. Pass --commit to delete them.');
    return;
  }

  await db.delete(notifications).where(where);
  console.log(`deleted ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
