/**
 * Lists every object in the media bucket, compares against keys referenced by
 * users.avatar_key / offer_images, and reports (or deletes with --delete)
 * objects older than 24 hours that no row references.
 *
 * The age check is load-bearing: without it this races an upload in progress.
 *
 * Usage:
 *   npm run media:prune           # dry run
 *   npm run media:prune -- --delete
 */
import { env } from '../config/env.js';
import { db, closeDatabase } from '../db/index.js';
import { offerImages, users } from '../db/schema/index.js';
import { deleteObject, listObjects } from '../lib/storage.js';

const AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A development database against the production bucket is the dangerous
 * combination: the local database has none of production's rows, so every
 * production object looks unreferenced and `--delete` would destroy real
 * users' avatars and offer images. Reading is harmless, so only deleting is
 * refused.
 */
function assertNotDevDatabaseAgainstRemoteStorage() {
  const dbIsLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(env.DATABASE_URL);
  const storageIsRemote = (env.SUPABASE_URL ?? '').includes('.supabase.co');

  if (dbIsLocal && storageIsRemote) {
    throw new Error(
      'Refusing to delete: DATABASE_URL is a local database but SUPABASE_URL is a hosted '
        + 'project. Every production object would look like an orphan. Run this where the '
        + 'database and the bucket belong to the same environment.',
    );
  }
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  if (shouldDelete) assertNotDevDatabaseAgainstRemoteStorage();
  const now = Date.now();

  const [avatarRows, imageRows, objects] = await Promise.all([
    db.select({ key: users.avatarKey }).from(users),
    db.select({ objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey }).from(offerImages),
    listObjects(''),
  ]);

  const referenced = new Set<string>();
  for (const row of avatarRows) {
    if (row.key) referenced.add(row.key);
  }
  for (const row of imageRows) {
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
