import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeSubdomains } from './taxonomy.js';
import { municipalities } from './geography.js';

export const postingStatusEnum = pgEnum('posting_status', ['open', 'closed', 'expired']);

/**
 * Work a client wants done. Unlike an offer, the sub-domain is not constrained
 * to anything the poster registered — a client is not a creative (ADR 0025).
 */
export const postings = pgTable(
  'postings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The client. Not a profile: anyone with an account can post.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    // Where the work is, which is not always where the client lives.
    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    budgetMinCentavos: integer('budget_min_centavos'),
    budgetMaxCentavos: integer('budget_max_centavos'),
    status: postingStatusEnum('status').notNull().default('open'),
    // A board of stale postings teaches creatives nothing there is real.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('postings_user_created_idx').on(table.userId, table.createdAt),
    // The feed query runs on this.
    index('postings_subdomain_status_idx').on(table.subdomainId, table.status, table.expiresAt),
    index('postings_reviewed_idx').on(table.reviewedAt),
  ],
);

export const postingsRelations = relations(postings, ({ one }) => ({
  user: one(users, { fields: [postings.userId], references: [users.id] }),
  subdomain: one(creativeSubdomains, {
    fields: [postings.subdomainId],
    references: [creativeSubdomains.id],
  }),
  municipality: one(municipalities, {
    fields: [postings.municipalityId],
    references: [municipalities.id],
  }),
}));

export type Posting = typeof postings.$inferSelect;
export type NewPosting = typeof postings.$inferInsert;
