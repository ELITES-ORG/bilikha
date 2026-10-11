import type { MessageKey } from '@/i18n/catalogs/en';
import type { OrganizationRole, OrganizationStatus } from './types';

/** One wording for each role, everywhere it is shown. */
export const ROLE_LABEL: Record<OrganizationRole, MessageKey> = {
  founder: 'organizations.role.founder',
  co_founder: 'organizations.role.coFounder',
  member: 'organizations.role.member',
};

/**
 * What the team sees about its page's review. Phrased as what is true for
 * them, not as the internal status name.
 */
export const STATUS_LABEL: Record<OrganizationStatus, MessageKey> = {
  pending_review: 'organizations.status.pendingReview',
  published: 'organizations.status.published',
  rejected: 'organizations.status.rejected',
  suspended: 'organizations.status.suspended',
};

/** Founder and co-founders run the team; a member is listed on it. */
export function canManage(role: OrganizationRole | null | undefined): boolean {
  return role === 'founder' || role === 'co_founder';
}
