import { env } from '../config/env.js';

/**
 * Whether the database and the storage project belong to the same environment.
 *
 * A development database against a hosted bucket is the dangerous combination:
 * the local database has none of that environment's rows, so every hosted
 * object looks unreferenced, and anything that deletes "orphans" would destroy
 * real files — avatars, offer photos, or someone's ID. Reading is harmless;
 * every orphan deletion checks this first.
 */
export function storageBelongsToDatabase(
  databaseUrl: string = env.DATABASE_URL,
  supabaseUrl: string | undefined = env.SUPABASE_URL,
): boolean {
  const databaseIsLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl);
  const storageIsHosted = (supabaseUrl ?? '').includes('.supabase.co');
  return !(databaseIsLocal && storageIsHosted);
}
