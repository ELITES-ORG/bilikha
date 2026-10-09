import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users.js';
import { municipalities } from './geography.js';
import { creativeSubdomains } from './taxonomy.js';

/**
 * Organisations are teams of creatives (ADR 0054), not an account type. Nobody
 * signs in as one, and `users.account_type` is not used for them.
 *
 * A dedicated status enum rather than reusing `profile_status`, because a
 * rejected organisation and a suspended one must behave differently. Profiles
 * record a rejection as `suspended` plus a reason, which is fine for a person.
 * For an organisation a rejected page must stop counting toward the
 * five-organisation cap, so the founder can submit a new one, while an
 * organisation suspended for abuse must keep counting — otherwise suspension
 * becomes a way to spin up a replacement. One value cannot mean both.
 */
export const organizationStatusEnum = pgEnum('organization_status', [
  'pending_review',
  'published',
  'rejected',
  'suspended',
]);

/**
 * Exactly one founder per organisation — held by a partial unique index on
 * `organization_members`, not by service code. Only the founder may invite or
 * remove co-founders; that power stays with one person (ADR 0054).
 */
export const organizationRoleEnum = pgEnum('organization_role', [
  'founder',
  'co_founder',
  'member',
]);

/**
 * The public page. Shaped after `creative_profiles` on purpose: the admin
 * review queue already understands slug, status, review and the
 * edited-since-review flag, and organisations join that queue rather than
 * getting a second one.
 *
 * There is no founder column. The founder is a membership row, so handing the
 * role over is one write in one table rather than two that can disagree.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // A public URL, shared into Messenger and indexed. Permanent, for the
    // reason ADR 0049 gives for taxonomy slugs: changing one breaks every link
    // that ever pointed at it.
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    bio: text('bio'),
    // Storage key, as `users.avatar_key` is. The upload path arrives with the
    // page in plan 0051 phase 4.
    logoKey: text('logo_key'),
    municipalityId: uuid('municipality_id')
      .notNull()
      .references(() => municipalities.id, { onDelete: 'restrict' }),
    // Enters review before it is public, because an organisation name is easier
    // to impersonate than a person's (ADR 0054).
    status: organizationStatusEnum('status').notNull().default('pending_review'),
    // Shown to the founder verbatim, so written as something they can act on.
    rejectionReason: text('rejection_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    // Set when a public field changes on a published page; the page stays live
    // and lands in the Edited queue. ADR 0016.
    editedSinceReviewAt: timestamp('edited_since_review_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organizations_slug_idx').on(table.slug),
    index('organizations_status_created_idx').on(table.status, table.createdAt),
  ],
);

/**
 * Who is in a team, and as what.
 *
 * A row exists only once somebody has accepted an invitation, or founded the
 * organisation. Nobody is listed on a public page without consenting to it
 * (RA 10173, constraint 7), and this table is what the page lists.
 *
 * `user_id` is `restrict`, deliberately. There is no account-deletion feature
 * yet, so ADR 0054's rule that a founder hands over before deleting their
 * account has no flow to attach to. With `cascade`, deleting a founder's row
 * at the database would silently leave an organisation with no founder.
 * `restrict` makes that impossible: nobody in an organisation can be deleted
 * until they have left it, and whatever deletion flow is built later has to
 * take them out of their organisations first — which ADR 0054 requires anyway.
 */
export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    role: organizationRoleEnum('role').notNull(),
    // Free text — "Full-stack developer", "QA". Job titles are not taxonomy,
    // and the nine domains are not ours to extend (ADR 0054).
    title: text('title'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_members_org_user_idx').on(table.organizationId, table.userId),
    // At most one founder, enforced by the database. "At least one" is held by
    // founding and handover each writing the founder row in one transaction,
    // and by `restrict` above.
    uniqueIndex('organization_members_one_founder_idx')
      .on(table.organizationId)
      .where(sql`role = 'founder'`),
    // The five-organisation cap counts a person's memberships; this keeps that
    // count an index lookup.
    index('organization_members_user_idx').on(table.userId),
  ],
);

/**
 * Pending, accepted and declined invitations.
 *
 * Expiry is not stored as a state. An invitation lasts seven days and expires
 * on its own: `expires_at < now()` is computed when it is read, so there is no
 * scheduled job and nothing to fall out of date.
 *
 * One unanswered invitation per person per organisation, by partial unique
 * index. **That index cannot see expiry** — `now()` is not allowed in an index
 * predicate — so an expired invitation still occupies the slot. Re-inviting
 * someone after expiry must therefore update this row's `expires_at`, not
 * insert a second row, or it fails with a unique violation.
 */
export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invitedUserId: uuid('invited_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable so the record survives the inviter's account being deleted.
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    // Never `founder` — the founder role is founded or handed over, not
    // invited into. Held by a check constraint below.
    role: organizationRoleEnum('role').notNull(),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    declinedAt: timestamp('declined_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('organization_invitations_one_pending_idx')
      .on(table.organizationId, table.invitedUserId)
      .where(sql`accepted_at is null and declined_at is null`),
    // "What is waiting for me" in the account hub.
    index('organization_invitations_invited_idx').on(table.invitedUserId),
    // An answer is one or the other. Both set would make the invitation
    // neither pending nor clearly answered.
    check(
      'organization_invitations_one_answer',
      sql`${table.acceptedAt} is null or ${table.declinedAt} is null`,
    ),
    check('organization_invitations_not_founder', sql`${table.role} <> 'founder'`),
  ],
);

/**
 * What the organisation does — Gaming Studios, Film Production Companies.
 * Mirrors `creative_profile_subdomains` exactly, including the one-primary
 * index.
 *
 * The caps — one or two domains, up to five sub-domains — are service rules,
 * not constraints. A check constraint here would fight an administrator
 * correcting data, and the caps are counts across rows, which a constraint
 * cannot express cleanly anyway.
 */
export const organizationSubdomains = pgTable(
  'organization_subdomains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subdomainId: uuid('subdomain_id')
      .notNull()
      .references(() => creativeSubdomains.id, { onDelete: 'restrict' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_subdomains_org_subdomain_idx').on(
      table.organizationId,
      table.subdomainId,
    ),
    uniqueIndex('organization_subdomains_one_primary_idx')
      .on(table.organizationId)
      .where(sql`is_primary`),
    index('organization_subdomains_subdomain_idx').on(table.subdomainId),
  ],
);

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  municipality: one(municipalities, {
    fields: [organizations.municipalityId],
    references: [municipalities.id],
  }),
  members: many(organizationMembers),
  invitations: many(organizationInvitations),
  subdomains: many(organizationSubdomains),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvitations.organizationId],
    references: [organizations.id],
  }),
  invitedUser: one(users, {
    fields: [organizationInvitations.invitedUserId],
    references: [users.id],
  }),
}));

export const organizationSubdomainsRelations = relations(organizationSubdomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationSubdomains.organizationId],
    references: [organizations.id],
  }),
  subdomain: one(creativeSubdomains, {
    fields: [organizationSubdomains.subdomainId],
    references: [creativeSubdomains.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type OrganizationSubdomain = typeof organizationSubdomains.$inferSelect;
