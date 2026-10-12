/**
 * Runs the ID retention passes once, as the API does every hour (ADR 0057):
 * deletes the images of rows decided at least 7 days ago, and ID objects older
 * than a day that no row references.
 *
 * Nothing here is optional deletion — the 7 days are the policy, and the API
 * would delete the same objects within the hour. This exists to run it now,
 * or where the API is not running.
 *
 * Usage:
 *   npm run ids:purge
 */
import { closeDatabase } from '../db/index.js';
import { isStorageConfigured } from '../lib/storage.js';
import { storageBelongsToDatabase } from '../lib/storage-safety.js';
import { purgeDecidedIdImages, purgeOrphanIdObjects } from '../modules/verification/retention.js';

async function main() {
  if (!isStorageConfigured()) {
    console.log('Storage is not configured; there are no ID images to delete.');
    return;
  }

  const now = new Date();
  const decided = await purgeDecidedIdImages(now);
  console.log(`Decided rows whose images were deleted: ${decided}`);

  if (!storageBelongsToDatabase()) {
    console.log(
      'Unreferenced ID objects left alone: DATABASE_URL is a local database but SUPABASE_URL is a '
        + 'hosted project, so every real ID would look unreferenced. Run this where the database '
        + 'and the bucket belong to the same environment.',
    );
    return;
  }
  const orphans = await purgeOrphanIdObjects(now);
  console.log(`Unreferenced ID objects deleted: ${orphans}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
