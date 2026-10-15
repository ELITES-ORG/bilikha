/**
 * Creates or updates the four public offer buckets (images, audio, video,
 * documents) and the four private message buckets, so each one's privacy, size
 * limit and allowed types match UPLOAD_LIMITS (ADR 0046, ADR 0060). Storage
 * enforces them too, so a browser that skips our checks still cannot store a
 * 2 GB file. The ID bucket is never touched.
 *
 * --max-file-size caps every bucket's limit, for a Supabase plan whose global
 * limit is smaller than the largest kind (the free plan's is 50 MB).
 *
 * Usage:
 *   npm run media:buckets
 *   npm run media:buckets -- --max-file-size 50000000
 *   npm run media:buckets -- --check     # report differences, change nothing
 */
import { env } from '../config/env.js';
import type { MediaKind, UploadDestination } from '../contracts/media.js';
import { bucketSettings, isStorageConfigured, saveBucket, type BucketSettings } from '../lib/storage.js';
import { UPLOAD_LIMITS, bucketFor, isPrivateDestination } from '../modules/media/media.limits.js';

function maxFileSizeArg(): number | null {
  const index = process.argv.indexOf('--max-file-size');
  if (index === -1) return null;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('--max-file-size needs a whole number of bytes, e.g. --max-file-size 50000000');
  }
  return value;
}

function differences(current: BucketSettings, wanted: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }) {
  const found: string[] = [];
  if (current.public !== wanted.public) found.push(`public is ${current.public}, want ${wanted.public}`);
  if (current.fileSizeLimit !== wanted.fileSizeLimit) {
    found.push(`file_size_limit is ${current.fileSizeLimit ?? 'unset'}, want ${wanted.fileSizeLimit}`);
  }
  const have = [...(current.allowedMimeTypes ?? [])].sort().join(', ');
  const want = [...wanted.allowedMimeTypes].sort().join(', ');
  if (have !== want) found.push(`allowed_mime_types is [${have || 'any'}], want [${want}]`);
  return found;
}

async function main() {
  if (!isStorageConfigured()) {
    throw new Error('Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const checkOnly = process.argv.includes('--check');
  const cap = maxFileSizeArg();
  let failed = false;

  const targets = (Object.keys(UPLOAD_LIMITS) as UploadDestination[]).flatMap((destination) =>
    (Object.keys(UPLOAD_LIMITS[destination]) as MediaKind[]).map((kind) => ({ destination, kind })),
  );

  for (const { destination, kind } of targets) {
    const limit = UPLOAD_LIMITS[destination][kind];
    const bucket = bucketFor(kind, destination);
    if (bucket === env.SUPABASE_ID_BUCKET) {
      console.error(`skipped ${bucket}: it is the ID bucket`);
      failed = true;
      continue;
    }
    const wanted = {
      public: !isPrivateDestination(destination),
      fileSizeLimit: cap === null ? limit.maxBytes : Math.min(limit.maxBytes, cap),
      allowedMimeTypes: [...limit.mimeTypes],
    };

    try {
      const current = await bucketSettings(bucket);
      if (!current) {
        if (checkOnly) {
          console.log(`missing ${bucket}`);
          failed = true;
        } else {
          await saveBucket(bucket, wanted, false);
          console.log(`created ${bucket}`);
        }
        continue;
      }

      const found = differences(current, wanted);
      if (found.length === 0) {
        console.log(`ok ${bucket}`);
      } else if (checkOnly) {
        for (const difference of found) console.log(`differs ${bucket}: ${difference}`);
        failed = true;
      } else {
        await saveBucket(bucket, wanted, true);
        console.log(`updated ${bucket} (${found.join('; ')})`);
      }
    } catch (error) {
      console.error(`${bucket}: ${error instanceof Error ? error.message : String(error)}`);
      failed = true;
    }
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
