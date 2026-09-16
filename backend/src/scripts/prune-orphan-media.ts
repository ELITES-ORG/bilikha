/**
 * Lists every object in the media bucket, compares against keys referenced by
 * users.avatar_key / portfolio_items, and reports (or deletes with --delete)
 * objects older than 24 hours that no row references.
 *
 * The age check is load-bearing: without it this races an upload in progress.
 *
 * Usage:
 *   npm run media:prune           # dry run
 *   npm run media:prune -- --delete
 */
import { db, closeDatabase } from '../db/index.js';
import { portfolioItems, users } from '../db/schema/index.js';
import { deleteObject, listObjects } from '../lib/storage.js';

const AGE_MS = 24 * 60 * 60 * 1000;

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  const now = Date.now();

  const [avatarRows, portfolioRows, objects] = await Promise.all([
    db.select({ key: users.avatarKey }).from(users),
    db.select({ objectKey: portfolioItems.objectKey, thumbKey: portfolioItems.thumbKey }).from(portfolioItems),
    listObjects(''),
  ]);

  const referenced = new Set<string>();
  for (const row of avatarRows) {
    if (row.key) referenced.add(row.key);
  }
  for (const row of portfolioRows) {
    referenced.add(row.objectKey);
    referenced.add(row.thumbKey);
  }

  const orphans = objects.filter((object) => {
    if (referenced.has(object.name)) return false;
    if (!object.updatedAt) return false;
    const age = now - new Date(object.updatedAt).getTime();
    return age >= AGE_MS;
  });

  if (orphans.length === 0) {
    console.log('No orphaned objects older than 24 hours.');
    return;
  }

  console.log(`${orphans.length} orphan(s) older than 24 hours:`);
  for (const orphan of orphans) {
    console.log(`  ${orphan.name}  (updated ${orphan.updatedAt})`);
  }

  if (!shouldDelete) {
    console.log('\nDry run. Pass --delete to remove them.');
    return;
  }

  for (const orphan of orphans) {
    await deleteObject(orphan.name);
    console.log(`deleted ${orphan.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
