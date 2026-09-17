import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { creativeProfiles, offers } from './profiles.js';
import { postings } from './postings.js';

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

/** Append-only. Messages are never edited or deleted; offer_id is set at insert. */
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
    // Null for every message that predates plan 0012, and for anyone who
    // contacts a creative from their profile rather than from an offer.
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
    // Mirror of offer_id for creatives replying to a client's posting (ADR 0025).
    postingId: uuid('posting_id').references(() => postings.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The thread query, and the polling query filtered by createdAt.
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
    index('messages_offer_idx').on(table.offerId),
    index('messages_posting_idx').on(table.postingId),
  ],
);

/**
 * Client bookmarks on offers. Cascades both ways: leaving the account or
 * deleting the offer removes the row.
 */
export const savedOffers = pgTable(
  'saved_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('saved_offers_user_offer_idx').on(table.userId, table.offerId),
    index('saved_offers_user_created_idx').on(table.userId, table.createdAt),
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
  offer: one(offers, { fields: [messages.offerId], references: [offers.id] }),
  posting: one(postings, { fields: [messages.postingId], references: [postings.id] }),
}));

export const savedOffersRelations = relations(savedOffers, ({ one }) => ({
  user: one(users, { fields: [savedOffers.userId], references: [users.id] }),
  offer: one(offers, { fields: [savedOffers.offerId], references: [offers.id] }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type SavedOffer = typeof savedOffers.$inferSelect;
