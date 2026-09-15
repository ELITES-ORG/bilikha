import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core';

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
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);
