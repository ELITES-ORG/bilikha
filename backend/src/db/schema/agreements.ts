import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  date,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './users.js';
import { conversations } from './conversations.js';

/**
 * Document lifecycle for a work agreement. Separate from the engagement
 * lifecycle in agreement_events — an accepted row never changes again
 * (ADR 0029). This is not a BIR-regulated document.
 */
export const agreementStatusEnum = pgEnum('agreement_status', [
  'sent',
  'accepted',
  'superseded',
  'withdrawn',
]);

export const agreementEventTypeEnum = pgEnum('agreement_event_type', [
  'started',
  'delivery_marked',
  'completion_confirmed',
  'cancelled',
]);

/**
 * A priced package proposed in a conversation. Total, end date, and engagement
 * state are never columns — they are derived on read (ADR 0029).
 */
export const agreements = pgTable(
  'agreements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    // Always the creative. Restrict: deleting the issuer must not erase the record.
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    version: integer('version').notNull().default(1),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => agreements.id, {
      onDelete: 'set null',
    }),
    packageTitle: text('package_title').notNull(),
    notes: text('notes'),
    startDate: date('start_date').notNull(),
    durationDays: integer('duration_days').notNull(),
    status: agreementStatusEnum('status').notNull().default('sent'),
    revisionNote: text('revision_note'),
    revisionRequestedAt: timestamp('revision_requested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('agreements_conversation_created_idx').on(table.conversationId, table.createdAt),
    check('agreements_duration_positive', sql`${table.durationDays} > 0`),
    check('agreements_version_positive', sql`${table.version} > 0`),
  ],
);

export const agreementLineItems = pgTable(
  'agreement_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    priceCentavos: integer('price_centavos').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('agreement_line_items_agreement_sort_idx').on(table.agreementId, table.sortOrder),
    check('agreement_line_items_price_non_negative', sql`${table.priceCentavos} >= 0`),
  ],
);

/**
 * Who accepted what, and a hash of exactly the terms they saw. One row per
 * agreement — the unique index, not the service, makes double acceptance
 * impossible.
 */
export const agreementAcceptances = pgTable(
  'agreement_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    acceptedByUserId: uuid('accepted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    contentHash: text('content_hash').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('agreement_acceptances_agreement_idx').on(table.agreementId)],
);

/**
 * Append-only engagement events. The accepted agreement row stays frozen;
 * everything that happens afterwards is a new row here (ADR 0029 rule 10).
 */
export const agreementEvents = pgTable(
  'agreement_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: agreementEventTypeEnum('type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('agreement_events_agreement_created_idx').on(table.agreementId, table.createdAt)],
);

export const agreementsRelations = relations(agreements, ({ one, many }) => ({
  issuer: one(users, {
    fields: [agreements.issuedByUserId],
    references: [users.id],
  }),
  supersedes: one(agreements, {
    fields: [agreements.supersedesId],
    references: [agreements.id],
    relationName: 'agreementSupersession',
  }),
  lineItems: many(agreementLineItems),
  acceptance: one(agreementAcceptances),
  events: many(agreementEvents),
}));

export const agreementLineItemsRelations = relations(agreementLineItems, ({ one }) => ({
  agreement: one(agreements, {
    fields: [agreementLineItems.agreementId],
    references: [agreements.id],
  }),
}));

export const agreementAcceptancesRelations = relations(agreementAcceptances, ({ one }) => ({
  agreement: one(agreements, {
    fields: [agreementAcceptances.agreementId],
    references: [agreements.id],
  }),
  acceptedBy: one(users, {
    fields: [agreementAcceptances.acceptedByUserId],
    references: [users.id],
  }),
}));

export const agreementEventsRelations = relations(agreementEvents, ({ one }) => ({
  agreement: one(agreements, {
    fields: [agreementEvents.agreementId],
    references: [agreements.id],
  }),
  actor: one(users, {
    fields: [agreementEvents.actorUserId],
    references: [users.id],
  }),
}));

export type Agreement = typeof agreements.$inferSelect;
export type AgreementLineItem = typeof agreementLineItems.$inferSelect;
export type AgreementAcceptance = typeof agreementAcceptances.$inferSelect;
export type AgreementEvent = typeof agreementEvents.$inferSelect;
