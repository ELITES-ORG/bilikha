import { pgTable, pgEnum, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeProfiles } from './profiles.js';

/**
 * `declined` is a real outcome, not a failure — a creative who is unavailable
 * should be able to say so in one click. Both `responded` and `declined` count
 * as answered when computing a response rate; only `sent` and `read` do not.
 */
export const inquiryStatusEnum = pgEnum('inquiry_status', [
  'sent',
  'read',
  'responded',
  'declined',
]);

export const inquiries = pgTable(
  'inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Addressed to the profile, not the user: the profile is the public entity
    // and the thing the sender actually saw.
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    subject: text('subject').notNull(),
    message: text('message').notNull(),

    status: inquiryStatusEnum('status').notNull().default('sent'),
    // The creative's reply. One round trip by design — see the plan preamble.
    response: text('response'),

    readAt: timestamp('read_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The inbox query: one profile's inquiries, newest first.
    index('inquiries_profile_created_idx').on(table.profileId, table.createdAt),
    // The sent list.
    index('inquiries_sender_created_idx').on(table.senderUserId, table.createdAt),
    index('inquiries_status_idx').on(table.status),
  ],
);

export const inquiriesRelations = relations(inquiries, ({ one }) => ({
  profile: one(creativeProfiles, {
    fields: [inquiries.profileId],
    references: [creativeProfiles.id],
  }),
  sender: one(users, { fields: [inquiries.senderUserId], references: [users.id] }),
}));

export type Inquiry = typeof inquiries.$inferSelect;
