import { afterAll, beforeEach } from 'vitest';
import { closeDatabase, sql } from '../db/index.js';

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
