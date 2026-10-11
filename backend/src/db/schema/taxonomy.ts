import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * The nine domains and their sub-domains come from the RA 11904 (Philippine
 * Creative Industries Development Act) domain set. They arrive from
 * `seed/taxonomy-data.ts` when an environment is first set up, but **the
 * database is the source of truth from then on** — an administrator edits
 * labels in the admin area and the seed never overwrites them (ADR 0049).
 *
 * `slug` is the stable public identifier used in URLs; renaming a label must
 * never change a slug. `archived_at` takes an item out of circulation without
 * deleting it, because profiles, offers, postings and organisations reference
 * these rows.
 */
export const creativeDomains = pgTable(
  'creative_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    // Mirrors the statutory numbering (1-9) so the UI presents domains in the
    // order creatives already recognise.
    displayOrder: integer('display_order').notNull(),
    // Null means active. Archiving hides the item from pickers and browse
    // surfaces without touching the profiles, offers and postings that already
    // reference it, and without breaking a URL that names its slug (ADR 0049).
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_domains_slug_idx').on(table.slug),
    // Partial: the active-only list is read on nearly every page, and the
    // archived rows are the few that never appear in it.
    index('creative_domains_active_idx')
      .on(table.displayOrder)
      .where(sql`archived_at is null`),
  ],
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
    // Singular label for one offer, posting or creative ("Mobile App Developer"
    // for "Mobile App Developers"); `name` stays the official RA 11904 plural.
    // Issue #17. Filled for existing rows by the backfill migration.
    singularName: text('singular_name').notNull(),
    displayOrder: integer('display_order').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_subdomains_slug_idx').on(table.slug),
    index('creative_subdomains_domain_idx').on(table.domainId),
    index('creative_subdomains_active_idx')
      .on(table.domainId, table.displayOrder)
      .where(sql`archived_at is null`),
  ],
);

export const taxonomyItemKindEnum = pgEnum('taxonomy_item_kind', ['domain', 'subdomain']);

export const taxonomyChangeActionEnum = pgEnum('taxonomy_change_action', [
  'created',
  'updated',
  'archived',
  'restored',
  'deleted',
]);

/**
 * Append-only record of every administrator change to the taxonomy. Rows are
 * never updated or deleted.
 *
 * This exists because of ADR 0049: once the database rather than
 * `taxonomy-data.ts` is the source of truth, "who renamed this and when" has no
 * answer in git. `itemKind` and `itemSlug` are stored as text rather than as a
 * foreign key, so the history of a deleted item survives it.
 */
export const taxonomyChanges = pgTable(
  'taxonomy_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemKind: taxonomyItemKindEnum('item_kind').notNull(),
    itemSlug: text('item_slug').notNull(),
    action: taxonomyChangeActionEnum('action').notNull(),
    // Nullable so the history survives an administrator's account being
    // deleted, as moderation_actions does.
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    // The changed fields only, before and after. Never the whole row: the point
    // of reading this table is to see what moved.
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('taxonomy_changes_item_idx').on(table.itemKind, table.itemSlug),
    index('taxonomy_changes_created_idx').on(table.createdAt),
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
export type TaxonomyChange = typeof taxonomyChanges.$inferSelect;
