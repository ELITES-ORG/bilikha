import { pgTable, pgEnum, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

/**
 * ID verification for accounts registered after it ships (ADR 0057).
 *
 * `appealed` is a *not from Biliran* decline whose appeal is open. An account's
 * state is its latest row; **no row means not required**, which is every
 * account that existed before this — nothing may treat "no row" as pending.
 */
export const idVerificationStatusEnum = pgEnum('id_verification_status', [
  'pending',
  'verified',
  'declined_retry',
  'declined_final',
  'appealed',
]);

/**
 * One row per ID submission. A resubmission after *try again* is a new row, so
 * each submission keeps its own decision and its own 7 days.
 *
 * Every nullable column is null until its moment. The object keys point into
 * the private ID bucket, never the public media bucket, and are never returned
 * by a non-admin endpoint or logged.
 */
export const idVerifications = pgTable(
  'id_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: idVerificationStatusEnum('status').notNull().default('pending'),
    // A slug from the accepted list (contracts/verification.ts `IdType`).
    // Text, not an enum: the list is the issue's and will change.
    idType: text('id_type'),
    frontKey: text('front_key'),
    // Null for a single-page document, which has no back.
    backKey: text('back_key'),
    // When the person agreed to the ID-specific consent sentence, separate
    // from the general privacy consent on `users`.
    idConsentAt: timestamp('id_consent_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    // Always the **latest** decision: the first one, a reversal, or an appeal's
    // outcome. The 7 days before the images are deleted run from it.
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    imagesDeletedAt: timestamp('images_deleted_at', { withTimezone: true }),
    // Nullable so the record survives an administrator's account being deleted.
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    // Shown to the person when declined, so it is written for them.
    decisionReason: text('decision_reason'),
    // HMAC-SHA256 of the ID number an administrator typed from the photo, keyed
    // with ID_HASH_SECRET (modules/verification/id-number.ts). Never the number
    // itself. Outlives the images, so a repeated ID is still recognised.
    idNumberHash: text('id_number_hash'),
    // True when the administrator found no number on the ID, so the decision
    // was made without one.
    idNumberAbsent: boolean('id_number_absent').notNull().default(false),
    appealMessage: text('appeal_message'),
    appealedAt: timestamp('appealed_at', { withTimezone: true }),
    appealDecidedAt: timestamp('appeal_decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "The latest row" is read on every request by the browse-only gate.
    index('id_verifications_user_created_idx').on(table.userId, table.createdAt),
    // The admin queue, oldest first. There is no deadline for a review.
    index('id_verifications_queue_idx')
      .on(table.submittedAt)
      .where(sql`status in ('pending', 'appealed') and submitted_at is not null`),
    // The deletion sweep: decided rows whose images still exist.
    index('id_verifications_sweep_idx')
      .on(table.decidedAt)
      .where(sql`images_deleted_at is null`),
    // At most one open submission per account, so a double submit cannot make
    // two rows for one review.
    uniqueIndex('id_verifications_one_open_idx')
      .on(table.userId)
      .where(sql`status = 'pending'`),
    index('id_verifications_id_number_hash_idx')
      .on(table.idNumberHash)
      .where(sql`id_number_hash is not null`),
  ],
);

export type IdVerification = typeof idVerifications.$inferSelect;
export type NewIdVerification = typeof idVerifications.$inferInsert;
