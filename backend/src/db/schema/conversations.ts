import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeProfiles } from './profiles.js';

/**
 * Exactly two parties: the client who started it and the creative whose profile
 * they contacted. Modelled as explicit columns rather than a participants table
 * because "two" is a product rule, not a limitation — see ADR 0018.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    profileId: uuid('profile_id')
      .notNull()
      .references(() => creativeProfiles.id, { onDelete: 'cascade' }),
    // Denormalised from the profile so a participation check is one query.
    creativeUserId: uuid('creative_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientUserId: uuid('client_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    subject: text('subject').notNull(),

    // Denormalised for the thread list, which would otherwise need a correlated
    // subquery per row to sort by recency.
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),

    clientLastReadAt: timestamp('client_last_read_at', { withTimezone: true }),
    creativeLastReadAt: timestamp('creative_last_read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One thread per client per profile. A second "inquiry" continues the
    // existing conversation rather than starting a parallel one.
    uniqueIndex('conversations_profile_client_idx').on(table.profileId, table.clientUserId),
    index('conversations_creative_recent_idx').on(table.creativeUserId, table.lastMessageAt),
    index('conversations_client_recent_idx').on(table.clientUserId, table.lastMessageAt),
  ],
);

/** Append-only. Messages are never edited or deleted in this plan. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The thread query, and the polling query filtered by createdAt.
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  profile: one(creativeProfiles, {
    fields: [conversations.profileId],
    references: [creativeProfiles.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
