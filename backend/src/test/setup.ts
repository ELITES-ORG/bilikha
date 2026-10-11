import { afterAll, beforeEach } from 'vitest';
import { env } from '../config/env.js';
import { closeDatabase, sql } from '../db/index.js';

/**
 * Image storage is off under test, whatever this machine's backend/.env holds.
 * CI has no storage, so tests are written for that: with a developer's own
 * Supabase values loaded, an upload is signed or refused for real (502, not the
 * 503 a test expects), and replacing an image sends a delete to that project.
 * A test that needs storage sets these itself, as lib/storage.test.ts does.
 */
env.SUPABASE_URL = undefined;
env.SUPABASE_SERVICE_ROLE_KEY = undefined;

/**
 * Reference data is a fixture and is never truncated: everything else has a
 * foreign key into it, and the seed that produces it is the same idempotent one
 * production runs. No test asserts on its contents (plan 0019 rule 2).
 */
const REFERENCE_TABLES = new Set([
  'municipalities',
  'barangays',
  'creative_domains',
  'creative_subdomains',
]);

/**
 * Discovered rather than listed, so a table added next month is cleaned without
 * anyone remembering to update this. A hard-coded list is how a test suite
 * starts leaking rows between cases six months after it was written.
 */
let truncatable: string[] | null = null;

async function tablesToTruncate(): Promise<string[]> {
  if (truncatable) return truncatable;

  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `;

  truncatable = rows
    .map((row) => row.tablename)
    .filter((name) => !REFERENCE_TABLES.has(name) && !name.startsWith('__drizzle'));

  return truncatable;
}

beforeEach(async () => {
  const tables = await tablesToTruncate();
  if (tables.length === 0) return;

  // One statement: Postgres truncates them together, so foreign keys between
  // them never block it. CASCADE covers anything reachable that the list missed.
  const list = tables.map((name) => `"public"."${name}"`).join(', ');
  await sql.unsafe(`truncate table ${list} restart identity cascade`);
});

afterAll(async () => {
  // Without this the pool keeps an open handle and vitest never exits.
  await closeDatabase();
});
