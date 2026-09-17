import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './users.js';
import { agreements } from './agreements.js';
import { reportStatusEnum } from './safety.js';

/**
 * One rating per completed agreement, left by the client on it (ADR 0033).
 *
 * There is no `profile_id` here. The creative is reachable through
 * `agreement → conversation → profile`, and a copied foreign key is a second
 * source of truth that a suspension or a moved conversation would leave stale
 * (ADR 0028).
 *
 * There is no average and no count either. Both are derived on read, like the
 * agreement total and the lifecycle state — a stored average goes wrong the
 * moment a rater is suspended.
 */
export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Unique: the second attempt is refused by this index, not by a service
    // check that races itself.
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    // Restrict: the record names who spoke, and losing that name would leave
    // an opinion about a person attributed to nobody.
    raterUserId: uuid('rater_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    stars: integer('stars').notNull(),
    // Capped at 500 by the schema that validates it — a review box that invites
    // an essay invites a grievance (ADR 0033).
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ratings_agreement_idx').on(table.agreementId),
    // Every public read joins the rater to filter suspended accounts out.
    index('ratings_rater_idx').on(table.raterUserId),
    check('ratings_stars_range', sql`${table.stars} between 1 and 5`),
  ],
);

/**
 * A creative's appeal against a rating, modelled on `conversation_reports` and
 * sharing its status enum. This is the creative's only recourse: there is no
 * public reply, and nobody rewrites somebody else's words (ADR 0033).
 */
export const ratingReports = pgTable(
  'rating_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ratingId: uuid('rating_id')
      .notNull()
      .references(() => ratings.id, { onDelete: 'cascade' }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: reportStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('rating_reports_status_created_idx').on(table.status, table.createdAt)],
);

export const ratingsRelations = relations(ratings, ({ one, many }) => ({
  agreement: one(agreements, {
    fields: [ratings.agreementId],
    references: [agreements.id],
  }),
  rater: one(users, { fields: [ratings.raterUserId], references: [users.id] }),
  reports: many(ratingReports),
}));

export const ratingReportsRelations = relations(ratingReports, ({ one }) => ({
  rating: one(ratings, { fields: [ratingReports.ratingId], references: [ratings.id] }),
  reporter: one(users, { fields: [ratingReports.reporterUserId], references: [users.id] }),
}));

export type Rating = typeof ratings.$inferSelect;
export type RatingReport = typeof ratingReports.$inferSelect;
