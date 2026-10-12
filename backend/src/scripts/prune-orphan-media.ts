/**
 * Lists every object in the four offer buckets (images, audio, video,
 * documents), compares against keys referenced by users.avatar_key and
 * avatar_pending_key, organizations.logo_key and logo_pending_key, offer_images,
 * and unexpired upload reservations, and reports (or deletes with --delete)
 * objects older than 24 hours that no row references. With --delete it first
 * removes expired reservations, so their objects count as orphans.
 *
 * The age check is load-bearing: without it this races an upload in progress.
 * The ID bucket is never listed or touched.
 *
 * Usage:
 *   npm run media:prune           # dry run
 *   npm run media:prune -- --delete
 */
import { gt, lte } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, closeDatabase } from '../db/index.js';
import { mediaUploads, offerImages, organizations, users } from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';
import { deleteObject, listObjects, type StoredObject } from '../lib/storage.js';
import { MEDIA_KINDS, bucketFor } from '../modules/media/media.limits.js';

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

function addReference(referenced: Map<string, Set<string>>, bucket: string, key: string | null) {
  if (!key) return;
  let keys = referenced.get(bucket);
  if (!keys) {
    keys = new Set<string>();
    referenced.set(bucket, keys);
  }
  keys.add(key);
}

async function main() {
  const shouldDelete = process.argv.includes('--delete');
  if (shouldDelete) assertNotDevDatabaseAgainstRemoteStorage();
  const now = Date.now();

  // Before the references are read: an expired reservation no longer holds its object.
  if (shouldDelete) {
    const expired = await db
      .delete(mediaUploads)
      .where(lte(mediaUploads.expiresAt, new Date(now)))
      .returning({ id: mediaUploads.id });
    console.log(`Deleted ${expired.length} expired upload reservation(s).`);
  }

  const [avatarRows, logoRows, itemRows, reservationRows] = await Promise.all([
    // Pending photos and logos are referenced too: they wait for review (ADR 0058).
    db.select({ key: users.avatarKey, pending: users.avatarPendingKey }).from(users),
    db.select({ key: organizations.logoKey, pending: organizations.logoPendingKey }).from(organizations),
    db
      .select({ kind: offerImages.kind, objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
      .from(offerImages),
    db
      .select({ bucket: mediaUploads.bucket, objectKey: mediaUploads.objectKey, thumbKey: mediaUploads.thumbKey })
      .from(mediaUploads)
      .where(gt(mediaUploads.expiresAt, new Date(now))),
  ]);

  const mediaBucket = env.SUPABASE_STORAGE_BUCKET;
  const referenced = new Map<string, Set<string>>();
  for (const row of [...avatarRows, ...logoRows]) {
    addReference(referenced, mediaBucket, row.key);
    addReference(referenced, mediaBucket, row.pending);
  }
  for (const row of itemRows) {
    addReference(referenced, bucketFor(row.kind), row.objectKey);
    addReference(referenced, mediaBucket, row.thumbKey);
  }
  for (const row of reservationRows) {
    addReference(referenced, row.bucket, row.objectKey);
    addReference(referenced, mediaBucket, row.thumbKey);
  }

  const buckets = [...new Set(MEDIA_KINDS.map((kind) => bucketFor(kind)))].filter(
    (bucket) => bucket !== env.SUPABASE_ID_BUCKET,
  );

  const orphans: Array<{ bucket: string; object: StoredObject }> = [];
  for (const bucket of buckets) {
    let objects: StoredObject[];
    try {
      objects = await listObjects('', bucket);
    } catch (error) {
      if (error instanceof AppError && error.code === 'STORAGE_UNCONFIGURED') throw error;
      console.log(`bucket ${bucket} could not be listed (missing?), skipped`);
      continue;
    }
    const keys = referenced.get(bucket);
    for (const object of objects) {
      if (keys?.has(object.name)) continue;
      if (!object.updatedAt) continue;
      const age = now - new Date(object.updatedAt).getTime();
      if (age >= AGE_MS) orphans.push({ bucket, object });
    }
  }

  if (orphans.length === 0) {
    console.log('No orphaned objects older than 24 hours.');
    return;
  }

  console.log(`${orphans.length} orphan(s) older than 24 hours:`);
  for (const { bucket, object } of orphans) {
    console.log(`  ${bucket}/${object.name}  (updated ${object.updatedAt})`);
  }

  if (!shouldDelete) {
    console.log('\nDry run. Pass --delete to remove them.');
    return;
  }

  for (const { bucket, object } of orphans) {
    await deleteObject(object.name, bucket);
    console.log(`deleted ${bucket}/${object.name}`);
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
