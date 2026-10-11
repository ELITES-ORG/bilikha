/**
 * Organisation feature types. Response shapes live in `@contracts/organizations`
 * (ADR 0037). Request payloads stay here.
 */

export type {
  AdminOrganizationRow,
  ManagedOrganization,
  ManagedOrganizationMember,
  MyOrganization,
  MyOrganizationInvitation,
  OrganizationCard,
  OrganizationCraft,
  OrganizationRole,
  OrganizationStatus,
  PendingOrganizationInvitation,
  PublicOrganization,
  PublicOrganizationMember,
} from '@contracts/organizations';

export interface FoundOrganizationPayload {
  name: string;
  bio?: string;
  municipalitySlug: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
}

/** Only what changed. `bio: null` clears it; the slug is never sent. */
export type UpdateOrganizationPayload = Partial<Omit<FoundOrganizationPayload, 'bio'>> & {
  bio?: string | null;
};

export interface InvitePayload {
  username: string;
  role: 'member' | 'co_founder';
  title?: string;
}

export interface OrganizationListParams {
  domain?: string;
  subdomain?: string;
  municipality?: string;
}
