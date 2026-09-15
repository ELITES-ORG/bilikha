import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

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
    // PSGC code, kept for eventual reconciliation with official PSA datasets.
    psgcCode: text('psgc_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('municipalities_slug_idx').on(table.slug)],
);

export type Municipality = typeof municipalities.$inferSelect;

/**
 * Roughly 130 barangays across the eight municipalities. Sourced from the PSA
 * PSGC listing — never invented. Nullable on `users` because the list may not
 * be loaded yet; see docs/plans/0001-registration-and-auth.md.
 */
export const barangays = pgTable(
  'barangays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    psgcCode: text('psgc_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Slugs are unique per municipality, not globally — "Poblacion" exists in
    // several towns.
    uniqueIndex('barangays_municipality_slug_idx').on(table.municipalityId, table.slug),
    index('barangays_municipality_idx').on(table.municipalityId),
  ],
);

export type Barangay = typeof barangays.$inferSelect;
