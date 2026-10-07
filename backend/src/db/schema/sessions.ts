import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Backing store for express-session. Lives in our schema and migrations rather
 * than being created by a session-store library, so it is visible, indexed, and
 * versioned like every other table.
 */
export const sessions = pgTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    data: text('data').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Lifted out of the session blob so "every session for this account" is a
    // query rather than a LIKE over serialised JSON (ADR 0051). Nullable: a
    // session exists before anyone signs in. The cascade also clears a deleted
    // account's sessions, which previously lingered until the pruner reached
    // them.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('sessions_expires_at_idx').on(table.expiresAt),
    index('sessions_user_id_idx').on(table.userId),
  ],
);
