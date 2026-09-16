import {
  pgTable,
  pgEnum,
  uuid,
  text,
  date,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { municipalities, barangays } from './geography.js';

/** Organisations are out of scope for sprint 1; the column exists so adding
 *  them later is not a migration of every existing row. */
export const accountTypeEnum = pgEnum('account_type', ['individual', 'organization']);
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
/** Deliberately coarse. A finer permission model can come later; two roles is
 *  what sprint 1 needs and anything more is speculative. */
export const userRoleEnum = pgEnum('user_role', ['member', 'admin']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // `username` preserves the case the user typed, for display.
    // `usernameNormalized` is lowercase and carries the unique index, so
    // "JuanCruz" and "juancruz" collide. Login matches on the normalized column.
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),

    // Unverified in sprint 1 (ADR 0013). Contact details only — never use these
    // for password reset or identity matching until a verification flow exists.
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    phone: text('phone').notNull(),

    passwordHash: text('password_hash').notNull(),

    firstName: text('first_name').notNull(),
    middleName: text('middle_name'),
    lastName: text('last_name').notNull(),
    // "Jr.", "Sr.", "III" — common in Filipino names and corrupting to sorting
    // and dedup if folded into the surname.
    suffix: text('suffix'),

    // Needed to identify minors, who require parental consent under RA 10173.
    birthDate: date('birth_date').notNull(),

    accountType: accountTypeEnum('account_type').notNull().default('individual'),
    status: userStatusEnum('status').notNull().default('active'),
    role: userRoleEnum('role').notNull().default('member'),

    // Nullable: clients need not be in Biliran (ADR 0015 / plan 0004).
    municipalityId: uuid('municipality_id').references(() => municipalities.id, {
      onDelete: 'restrict',
    }),
    barangayId: uuid('barangay_id').references(() => barangays.id, { onDelete: 'set null' }),

    // RA 10173 requires demonstrable consent. Store when, and to which version
    // of the policy, so a later policy change can be re-consented.
    privacyConsentAt: timestamp('privacy_consent_at', { withTimezone: true }).notNull(),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    consentVersion: text('consent_version').notNull(),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    // One avatar per account — on the user, not the creative profile (ADR 0019).
    avatarKey: text('avatar_key'),
    avatarReviewedAt: timestamp('avatar_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_normalized_idx').on(table.usernameNormalized),
    uniqueIndex('users_email_normalized_idx').on(table.emailNormalized),
    uniqueIndex('users_phone_idx').on(table.phone),
    index('users_municipality_idx').on(table.municipalityId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
