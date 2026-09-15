import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Biliran has eight municipalities. A lookup table is deliberate: PostGIS and
 * coordinate search would be solving a problem this province does not have,
 * and a fixed list keeps filters predictable and joins cheap.
 */
export const municipalities = pgTable(
  'municipalities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // PSGC code, kept for eventual reconciliation with PSA/DTI datasets.
    psgcCode: text('psgc_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('municipalities_slug_idx').on(table.slug)],
);

export type Municipality = typeof municipalities.$inferSelect;
