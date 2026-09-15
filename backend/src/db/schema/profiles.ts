import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { creativeSubdomains } from './taxonomy.js';

/** Sprint 1 profiles enter at `pending_review` — without phone verification
 *  there is no spam floor, so nothing auto-publishes. See ADR 0013. */
export const profileStatusEnum = pgEnum('profile_status', [
  'draft',
  'pending_review',
  'published',
  'suspended',
]);

export const creativeProfiles = pgTable(
  'creative_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Public URL segment. Seeded from the normalized username at registration,
    // kept separate so a username change need not break shared links.
    slug: text('slug').notNull(),
    displayName: text('display_name'),
    bio: text('bio'),
    status: profileStatusEnum('status').notNull().default('pending_review'),
    // Shown to the registrant verbatim, so write it as something a person can
    // act on rather than an internal note.
    rejectionReason: text('rejection_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_profiles_user_idx').on(table.userId),
    uniqueIndex('creative_profiles_slug_idx').on(table.slug),
    index('creative_profiles_status_created_idx').on(table.status, table.createdAt),
  ],
);

export const creativeProfileSubdomains = pgTable(
  'creative_profile_subdomains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('cps_profile_subdomain_idx').on(table.profileId, table.subdomainId),
    // Partial unique index: at most one primary per profile, enforced by the
    // database rather than by application code that can be bypassed.
    uniqueIndex('cps_one_primary_per_profile_idx')
      .on(table.profileId)
      .where(sql`is_primary`),
    index('cps_subdomain_idx').on(table.subdomainId),
  ],
);

export const moderationActionEnum = pgEnum('moderation_action', [
  'approved',
  'rejected',
  'returned_to_pending',
]);

/**
 * Append-only record of every moderation decision. Rows are never updated or
 * deleted — the profile's current status is the state, this is the history.
 * Without it, "who published this profile and when" has no answer.
 */
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Nullable so the history survives an administrator's account being deleted.
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: moderationActionEnum('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('moderation_actions_profile_idx').on(table.profileId),
    index('moderation_actions_created_idx').on(table.createdAt),
  ],
);

export const creativeProfilesRelations = relations(creativeProfiles, ({ one, many }) => ({
  user: one(users, { fields: [creativeProfiles.userId], references: [users.id] }),
  subdomains: many(creativeProfileSubdomains),
}));

export const creativeProfileSubdomainsRelations = relations(
  creativeProfileSubdomains,
  ({ one }) => ({
    profile: one(creativeProfiles, {
      fields: [creativeProfileSubdomains.profileId],
      references: [creativeProfiles.id],
    }),
    subdomain: one(creativeSubdomains, {
      fields: [creativeProfileSubdomains.subdomainId],
      references: [creativeSubdomains.id],
    }),
  }),
);

export type CreativeProfile = typeof creativeProfiles.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
