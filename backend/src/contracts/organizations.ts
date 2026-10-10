/**
 * Organisations — teams of creatives with one public page (ADR 0054, plan 0051).
 *
 * Three views of the same organisation, because three audiences see different
 * things:
 *
 * - **Public** — anyone. Only a published organisation, and only members whose
 *   own profile is published and whose account is active.
 * - **Managed** — the team itself. Any status, every member, and the pending
 *   invitations for the founder and co-founders.
 * - **Admin** — the review queue.
 *
 * No user ids appear in the public view. A member is reached through their
 * profile slug, as a creative is everywhere else.
 */

export type OrganizationStatus = 'pending_review' | 'published' | 'rejected' | 'suspended';
export type OrganizationRole = 'founder' | 'co_founder' | 'member';

/** A sub-domain the organisation names as its work. */
export interface OrganizationCraft {
  slug: string;
  name: string;
  domainSlug: string;
  domainName: string;
  isPrimary: boolean;
}

export interface OrganizationMunicipality {
  slug: string;
  name: string;
}

export interface PublicOrganizationMember {
  displayName: string;
  profileSlug: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  /** Free text — "QA", "Full-stack developer". Job titles are not taxonomy. */
  title: string | null;
}

export interface PublicOrganization {
  slug: string;
  name: string;
  bio: string | null;
  logoUrl: string | null;
  municipality: OrganizationMunicipality;
  crafts: OrganizationCraft[];
  members: PublicOrganizationMember[];
  createdAt: string;
}

/** A directory card. */
export interface OrganizationCard {
  slug: string;
  name: string;
  logoUrl: string | null;
  municipality: OrganizationMunicipality;
  primaryCraft: OrganizationCraft | null;
  memberCount: number;
}

export interface ManagedOrganizationMember {
  userId: string;
  username: string;
  displayName: string;
  profileSlug: string | null;
  role: OrganizationRole;
  title: string | null;
  joinedAt: string;
}

export interface PendingOrganizationInvitation {
  id: string;
  username: string;
  displayName: string;
  role: OrganizationRole;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  /** Computed when read: invitations expire on their own, with no job. */
  expired: boolean;
}

export interface ManagedOrganization {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  logoUrl: string | null;
  municipality: OrganizationMunicipality;
  crafts: OrganizationCraft[];
  status: OrganizationStatus;
  /** Shown to the team verbatim when an administrator asks for changes. */
  rejectionReason: string | null;
  editedSinceReviewAt: string | null;
  myRole: OrganizationRole;
  members: ManagedOrganizationMember[];
  /** Empty for a plain member, who cannot invite. */
  invitations: PendingOrganizationInvitation[];
  createdAt: string;
}

/** An organisation the signed-in person belongs to, for the account hub. */
export interface MyOrganization {
  slug: string;
  name: string;
  status: OrganizationStatus;
  role: OrganizationRole;
}

/** An invitation waiting on the signed-in person. */
export interface MyOrganizationInvitation {
  id: string;
  organization: { slug: string; name: string };
  role: OrganizationRole;
  title: string | null;
  invitedBy: string | null;
  expiresAt: string;
}

export interface AdminOrganizationRow {
  id: string;
  slug: string;
  name: string;
  /** Shown in full: the reviewer decides on what the public would read. */
  bio: string | null;
  /** Craft names, primary first. */
  crafts: string[];
  status: OrganizationStatus;
  founderUsername: string | null;
  municipality: string;
  memberCount: number;
  createdAt: string;
  editedSinceReviewAt: string | null;
}
