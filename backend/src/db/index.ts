import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * postgres.js pools connections by default. `max` is kept modest because
 * managed Postgres tiers (Neon / Supabase free and hobby plans) cap total
 * connections well below what a naive default would open.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: isProduction ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;
export { schema };

export async function closeDatabase(): Promise<void> {
  await sql.end({ timeout: 5 });
}
