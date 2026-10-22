/**
 * Lists every object in the four offer buckets (images, audio, video,
 * documents) and the four private message buckets, compares against keys
 * referenced by users.avatar_key and avatar_pending_key, organizations.logo_key
 * and logo_pending_key, creative_profiles' four cover keys (cover_key,
 * cover_small_key and their pending pair), offer_images, message_attachments,
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
import type { UploadDestination } from '../contracts/media.js';
import { db, closeDatabase } from '../db/index.js';
import {
  creativeProfiles,
  mediaUploads,
  messageAttachments,
  offerImages,
  organizations,
  users,
} from '../db/schema/index.js';
import { AppError } from '../lib/http-error.js';
import { deleteObject, listObjects, type StoredObject } from '../lib/storage.js';
import { storageBelongsToDatabase } from '../lib/storage-safety.js';
import { MEDIA_KINDS, UPLOAD_LIMITS, bucketFor } from '../modules/media/media.limits.js';

const AGE_MS = 24 * 60 * 60 * 1000;

/** Deleting is refused when the database and the bucket are different environments. */
function assertNotDevDatabaseAgainstRemoteStorage() {
  if (!storageBelongsToDatabase()) {
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

  const [avatarRows, logoRows, coverRows, itemRows, attachmentRows, reservationRows] = await Promise.all([
    // Pending photos, logos and covers are referenced too: they wait for review (ADR 0058).
    db.select({ key: users.avatarKey, pending: users.avatarPendingKey }).from(users),
    db.select({ key: organizations.logoKey, pending: organizations.logoPendingKey }).from(organizations),
    db
      .select({
        key: creativeProfiles.coverKey,
        smallKey: creativeProfiles.coverSmallKey,
        pendingKey: creativeProfiles.coverPendingKey,
        pendingSmallKey: creativeProfiles.coverPendingSmallKey,
      })
      .from(creativeProfiles),
    db
      .select({ kind: offerImages.kind, objectKey: offerImages.objectKey, thumbKey: offerImages.thumbKey })
      .from(offerImages),
    db
      .select({
        kind: messageAttachments.kind,
        objectKey: messageAttachments.objectKey,
        thumbKey: messageAttachments.thumbKey,
      })
      .from(messageAttachments),
    db
      .select({
        destination: mediaUploads.destination,
        bucket: mediaUploads.bucket,
        objectKey: mediaUploads.objectKey,
        thumbKey: mediaUploads.thumbKey,
      })
      .from(mediaUploads)
      .where(gt(mediaUploads.expiresAt, new Date(now))),
  ]);

  const mediaBucket = env.SUPABASE_STORAGE_BUCKET;
  const referenced = new Map<string, Set<string>>();
  for (const row of [...avatarRows, ...logoRows]) {
    addReference(referenced, mediaBucket, row.key);
    addReference(referenced, mediaBucket, row.pending);
  }
  for (const row of coverRows) {
    for (const key of [row.key, row.smallKey, row.pendingKey, row.pendingSmallKey]) {
      addReference(referenced, mediaBucket, key);
    }
  }
  for (const row of itemRows) {
    addReference(referenced, bucketFor(row.kind), row.objectKey);
    addReference(referenced, mediaBucket, row.thumbKey);
  }
  // A message's thumbnail or poster lives in the private message image bucket.
  for (const row of attachmentRows) {
    addReference(referenced, bucketFor(row.kind, 'message'), row.objectKey);
    addReference(referenced, bucketFor('image', 'message'), row.thumbKey);
  }
  for (const row of reservationRows) {
    addReference(referenced, row.bucket, row.objectKey);
    addReference(referenced, bucketFor('image', row.destination), row.thumbKey);
  }

  const destinations = Object.keys(UPLOAD_LIMITS) as UploadDestination[];
  const buckets = [
    ...new Set(destinations.flatMap((destination) => MEDIA_KINDS.map((kind) => bucketFor(kind, destination)))),
  ].filter((bucket) => bucket !== env.SUPABASE_ID_BUCKET);

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
