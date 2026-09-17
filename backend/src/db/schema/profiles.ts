import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex, index, integer } from 'drizzle-orm/pg-core';
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
    // Which channel is revealed to a client when this creative responds to
    // their inquiry. Nothing is ever shown on the public profile itself.
    contactPreference: text('contact_preference').notNull().default('phone'),
    // Set when a publicly visible field changes on an already-published
    // profile. The profile stays live; this is what puts it in the admin
    // Edited queue. Cleared when an admin acknowledges it.
    // See ADR 0016.
    editedSinceReviewAt: timestamp('edited_since_review_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_profiles_user_idx').on(table.userId),
    uniqueIndex('creative_profiles_slug_idx').on(table.slug),
    index('creative_profiles_status_created_idx').on(table.status, table.createdAt),
    index('creative_profiles_edited_idx').on(table.editedSinceReviewAt),
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
  'acknowledged_edit',
  'media_removed',
  // Account-level, not profile-level: these target the person, and take their
  // work off every public surface with them. profile_id is null when the
  // account has no creative profile, which subject_user_id covers.
  'account_suspended',
  'account_reinstated',
  // An administrator removing a rating after a creative's appeal. Removal is
  // the only answer available — nobody edits someone else's words (ADR 0033).
  'rating_removed',
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
    // Nullable since ADR 0021: an avatar takedown can target an account with no
    // creative profile, and those removals must still be recorded.
    profileId: uuid('profile_id').references(() => creativeProfiles.id, {
      onDelete: 'cascade',
    }),
    // The account the action was taken against. Set for every media removal,
    // including one against a client who has no profile.
    subjectUserId: uuid('subject_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    // Nullable so the history survives an administrator's account being deleted.
    adminId: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: moderationActionEnum('action').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('moderation_actions_profile_idx').on(table.profileId),
    index('moderation_actions_subject_idx').on(table.subjectUserId),
    index('moderation_actions_created_idx').on(table.createdAt),
  ],
);

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Exactly one. The creative must have registered it — enforced in the
    // service, not by a composite FK. See ADR 0022.
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    description: text('description'),
    // Integer centavos. Null means "Price on request"; a minimum alone renders
    // "from ₱X". Never a float.
    priceMinCentavos: integer('price_min_centavos'),
    priceMaxCentavos: integer('price_max_centavos'),
    sortOrder: integer('sort_order').notNull().default(0),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Set when the description matches a contact-details pattern. Advisory —
    // it sorts the review queue, it does not hide the offer.
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('offers_profile_order_idx').on(table.profileId, table.sortOrder),
    index('offers_subdomain_created_idx').on(table.subdomainId, table.createdAt),
    index('offers_reviewed_idx').on(table.reviewedAt),
  ],
);

export const offerImages = pgTable(
  'offer_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('offer_images_offer_order_idx').on(table.offerId, table.sortOrder)],
);

export const creativeProfilesRelations = relations(creativeProfiles, ({ one, many }) => ({
  user: one(users, { fields: [creativeProfiles.userId], references: [users.id] }),
  subdomains: many(creativeProfileSubdomains),
  offers: many(offers),
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

export const offersRelations = relations(offers, ({ one, many }) => ({
  profile: one(creativeProfiles, {
    fields: [offers.profileId],
    references: [creativeProfiles.id],
  }),
  subdomain: one(creativeSubdomains, {
    fields: [offers.subdomainId],
    references: [creativeSubdomains.id],
  }),
  images: many(offerImages),
}));

export const offerImagesRelations = relations(offerImages, ({ one }) => ({
  offer: one(offers, {
    fields: [offerImages.offerId],
    references: [offers.id],
  }),
}));

export type CreativeProfile = typeof creativeProfiles.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type OfferImage = typeof offerImages.$inferSelect;
