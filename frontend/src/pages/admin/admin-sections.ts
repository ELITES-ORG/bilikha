import type { AdminSummary } from '@contracts/admin';
import { Flag, IdCard, Images, ListChecks, Search, Tags, Users } from 'lucide-react';

/**
 * The admin sections — one array, one file. Adding a moderation surface is an
 * entry here plus a route; it must not mean editing every sibling page
 * (ADR 0035 / plan 0022).
 *
 * Organised by subject (ADR 0059): each section is the one place every
 * decision about that thing is made — an organisation's page *and* its logo
 * under Organisations, a new offer *and* a change to one under Offers. The
 * first group is the work waiting; the second is tools.
 *
 * `/admin/profiles/:id` is a detail view, not a section. It does not appear
 * here; Creatives stays marked while it is open.
 */
export const ADMIN_GROUPS = [
  { id: 'decide', label: 'Needs your decision' },
  { id: 'manage', label: 'Manage' },
] as const;

export type AdminGroup = (typeof ADMIN_GROUPS)[number]['id'];

interface AdminSectionShape {
  label: string;
  path: string;
  group: AdminGroup;
  /** How many items wait in this section, for its badge; null for a tool. */
  waiting: ((summary: AdminSummary) => number) | null;
}

export const ADMIN_SECTIONS = [
  {
    label: 'Creatives',
    path: '/admin/creatives',
    icon: ListChecks,
    group: 'decide',
    waiting: (s: AdminSummary) => s.creatives.pending + s.creatives.edited,
  },
  {
    label: 'Offers',
    path: '/admin/offers',
    icon: Images,
    group: 'decide',
    waiting: (s: AdminSummary) => s.offers.new + s.offers.changes,
  },
  {
    label: 'Organisations',
    path: '/admin/organizations',
    icon: Users,
    group: 'decide',
    waiting: (s: AdminSummary) => s.organizations.pending + s.organizations.edited + s.organizations.logos,
  },
  {
    label: 'People',
    path: '/admin/people',
    icon: IdCard,
    group: 'decide',
    waiting: (s: AdminSummary) => s.people.photos + s.people.ids,
  },
  {
    label: 'Reports',
    path: '/admin/reports',
    icon: Flag,
    group: 'decide',
    waiting: (s: AdminSummary) => s.reports.open,
  },
  { label: 'Find an account', path: '/admin/accounts', icon: Search, group: 'manage', waiting: null },
  { label: 'Taxonomy', path: '/admin/taxonomy', icon: Tags, group: 'manage', waiting: null },
] as const satisfies ReadonlyArray<AdminSectionShape & { icon: unknown }>;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** The admin area's front door: the first section of work. */
export const ADMIN_HOME = '/admin/creatives';

/**
 * A section is marked on its own path and below it. A profile detail belongs
 * to Creatives, which reviews it.
 */
export function isAdminSectionActive(pathname: string, path: string): boolean {
  if (path === ADMIN_HOME && pathname.startsWith('/admin/profiles/')) return true;
  return pathname === path || pathname.startsWith(`${path}/`);
}
