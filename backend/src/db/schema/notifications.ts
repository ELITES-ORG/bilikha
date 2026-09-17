import { pgTable, pgEnum, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * Deliberately short. Every type added makes the existing ones less likely to
 * be read, and the pressure to add them is constant — see ADR 0030.
 *
 * Messages are absent on purpose: the Messages tab already carries an unread
 * badge, and a second count for the same fact is how a bell becomes noise.
 */
export const notificationTypeEnum = pgEnum('notification_type', [
  'profile_approved',
  'profile_rejected',
  'profile_edit_acknowledged',
  'posting_replied',
]);

/**
 * A notification stores *that something happened* and points at the thing. It
 * never copies the thing's contents.
 *
 * A copied title is a second source of truth, and it keeps showing a suspended
 * account's words after that account has been taken off every other surface
 * (ADR 0028). Titles are resolved at read time instead, so anything since
 * deleted or hidden renders as a tombstone.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The recipient.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Who caused it. Null for anything the system did on its own. Set null
    // rather than cascade: losing the actor must not erase the notification.
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: notificationTypeEnum('type').notNull(),
    // The conversation, profile or posting this points at. No foreign key: the
    // target table varies by type, and a dangling id has to render as a
    // tombstone rather than block the insert.
    targetId: uuid('target_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_created_idx').on(table.userId, table.createdAt.desc()),
    // Partial: the unread count is polled by every signed-in page, and without
    // this it scans each user's whole history on every poll.
    index('notifications_unread_idx')
      .on(table.userId)
      .where(sql`read_at is null`),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notificationRecipient',
  }),
  actor: one(users, {
    fields: [notifications.actorUserId],
    references: [users.id],
    relationName: 'notificationActor',
  }),
}));

export type Notification = typeof notifications.$inferSelect;
