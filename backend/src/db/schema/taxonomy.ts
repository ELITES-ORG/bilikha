import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Reference data only. The nine domains and their sub-domains come from the
 * DTI / RA 11904 (Philippine Creative Industries Development Act) taxonomy, so
 * they are seeded rather than user-generated. `slug` is the stable public
 * identifier used in URLs; renaming a label must never change a slug.
 */
export const creativeDomains = pgTable(
  'creative_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // Mirrors the numbering used in the DTI material (1-9) so the UI can
    // present domains in the order creatives already recognise.
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('creative_domains_slug_idx').on(table.slug)],
);

export const creativeSubdomains = pgTable(
  'creative_subdomains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id')
      .notNull()
      .references(() => creativeDomains.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_subdomains_slug_idx').on(table.slug),
    index('creative_subdomains_domain_idx').on(table.domainId),
  ],
);

export const creativeDomainsRelations = relations(creativeDomains, ({ many }) => ({
  subdomains: many(creativeSubdomains),
}));

export const creativeSubdomainsRelations = relations(creativeSubdomains, ({ one }) => ({
  domain: one(creativeDomains, {
    fields: [creativeSubdomains.domainId],
    references: [creativeDomains.id],
  }),
}));

export type CreativeDomain = typeof creativeDomains.$inferSelect;
export type CreativeSubdomain = typeof creativeSubdomains.$inferSelect;
