import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex, index, integer, bigint, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { mediaKindEnum } from './media-enums.js';
import { creativeSubdomains } from './taxonomy.js';
import { organizations } from './organizations.js';
import { idVerifications } from './verification.js';

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
    // The profile band image (issue #36): two widths of one upload under
    // covers/<profileId>/. A new cover waits in the pending pair until an
    // administrator approves it (ADR 0058); the approved pair stays public
    // meanwhile. ADR 0061.
    coverKey: text('cover_key'),
    coverSmallKey: text('cover_small_key'),
    coverPendingKey: text('cover_pending_key'),
    coverPendingSmallKey: text('cover_pending_small_key'),
    coverRejectionReason: text('cover_rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('creative_profiles_user_idx').on(table.userId),
    uniqueIndex('creative_profiles_slug_idx').on(table.slug),
    index('creative_profiles_status_created_idx').on(table.status, table.createdAt),
    index('creative_profiles_edited_idx').on(table.editedSinceReviewAt),
    // Directory search (ADR 0003). The expressions must match search-sql.ts
    // exactly, or the planner cannot use them.
    index('creative_profiles_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(bio, ''))`,
    ),
    index('creative_profiles_display_name_trgm_idx').using(
      'gin',
      table.displayName.op('gin_trgm_ops'),
    ),
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
  // An administrator issuing a temporary password (ADR 0051). No reason is
  // recorded: unlike a suspension, nothing about a reset needs explaining to
  // the person it happened to. The row exists so the reset is detectable.
  'password_reset',
  // ID verification (ADR 0057). Every look at someone's government ID is
  // recorded, not only decisions: access to it is itself something to answer
  // for. These rows carry id_verification_id.
  'id_viewed',
  'id_verified',
  'id_declined_retry',
  'id_declined_final',
  // A decision changed by an administrator within its 7 days.
  'id_decision_reversed',
  // The outcome of a person's one appeal against a *not from Biliran* decline.
  'id_appeal_granted',
  'id_appeal_upheld',
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
    // Set when the decision was about an organisation's page rather than a
    // person's profile (plan 0051). Organisations reuse `approved`, `rejected`
    // and `acknowledged_edit` — the action means the same thing, and which
    // column is set says what it was about. `set null` so the record outlives
    // an organisation that closes.
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    action: moderationActionEnum('action').notNull(),
    reason: text('reason'),
    // Set for the id_* actions, so "which IDs did this administrator view" is a
    // join rather than a search of `reason`. Set null rather than cascade: the
    // audit row outlives the record it was about.
    idVerificationId: uuid('id_verification_id').references(() => idVerifications.id, {
      onDelete: 'set null',
    }),
    // Set when an offer, or a change to one, was approved or rejected
    // (ADR 0058). Set null so the record outlives a deleted offer.
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('moderation_actions_profile_idx').on(table.profileId),
    index('moderation_actions_subject_idx').on(table.subjectUserId),
    index('moderation_actions_created_idx').on(table.createdAt),
    index('moderation_actions_organization_idx').on(table.organizationId),
    // ON DELETE SET NULL looks rows up by this column, and so does the audit
    // trail for one ID decision (plan 0053 Phase 3).
    index('moderation_actions_id_verification_idx').on(table.idVerificationId),
    index('moderation_actions_offer_idx').on(table.offerId),
  ],
);

/**
 * Whether an offer is on the directory (ADR 0058). A new offer waits for an
 * administrator before anyone else sees it; a rejected one stays hidden, with
 * the reason shown to its creative, until they change it and it goes back to
 * review. A published offer stays published while a change to it waits in
 * `offer_revisions`.
 */
export const offerStatusEnum = pgEnum('offer_status', ['pending_review', 'published', 'rejected']);

/**
 * A photo of a published offer is `live`. A photo added to one waits as
 * `pending_add`, unseen by the public, and a photo removed from one stays
 * public as `pending_remove`, until the change is reviewed (ADR 0058). A
 * photo of an offer that is not yet published is simply `live`: the whole
 * offer is hidden anyway.
 */
export const offerImageStateEnum = pgEnum('offer_image_state', ['live', 'pending_add', 'pending_remove']);

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
    status: offerStatusEnum('status').notNull().default('pending_review'),
    // Why an offer that was never published was rejected. Shown to its creative
    // verbatim; cleared when they change it and it goes back to review.
    rejectionReason: text('rejection_reason'),
    // Why the last change to a published offer was not approved. The offer
    // itself stayed as it was; cleared when the next change is submitted.
    revisionRejectionReason: text('revision_rejection_reason'),
    // When an administrator last approved the offer or a change to it.
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Set when the description matches a contact-details pattern. Advisory —
    // it sorts the review queue first.
    flaggedAt: timestamp('flagged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('offers_profile_order_idx').on(table.profileId, table.sortOrder),
    index('offers_subdomain_created_idx').on(table.subdomainId, table.createdAt),
    index('offers_reviewed_idx').on(table.reviewedAt),
    index('offers_search_idx').using(
      'gin',
      sql`to_tsvector('simple', title || ' ' || coalesce(description, ''))`,
    ),
    index('offers_title_trgm_idx').using('gin', table.title.op('gin_trgm_ops')),
    index('offers_status_idx').on(table.status),
  ],
);

/**
 * A change to a published offer, waiting for review beside the version the
 * public sees (ADR 0058). One per offer: editing again updates it. Approving
 * copies it onto the offer and deletes it; rejecting just deletes it, so the
 * published version stays exactly as it was.
 */
export const offerRevisions = pgTable('offer_revisions', {
  offerId: uuid('offer_id')
    .primaryKey()
    .references(() => offers.id, { onDelete: 'cascade' }),
  subdomainId: uuid('subdomain_id')
    .notNull()
    .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  priceMinCentavos: integer('price_min_centavos'),
  priceMaxCentavos: integer('price_max_centavos'),
  flaggedAt: timestamp('flagged_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const offerImages = pgTable(
  'offer_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    // An image's thumbnail or a video's poster. Audio, PDF and a video without a poster have none.
    thumbKey: text('thumb_key'),
    sortOrder: integer('sort_order').notNull().default(0),
    state: offerImageStateEnum('state').notNull().default('live'),
    // Images, and from ADR 0046 audio, video and PDF. The kind decides the
    // bucket the object is in; a thumbnail or poster is always in the image
    // bucket.
    kind: mediaKindEnum('kind').notNull().default('image'),
    mimeType: text('mime_type'),
    // The main file plus its thumbnail or poster. Null for images recorded
    // before ADR 0046, which count as nothing toward the quota.
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    durationSeconds: integer('duration_seconds'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('offer_images_offer_order_idx').on(table.offerId, table.sortOrder),
    check('offer_images_image_has_thumb', sql`${table.kind} <> 'image' OR ${table.thumbKey} IS NOT NULL`),
  ],
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
