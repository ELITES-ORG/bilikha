/**
 * The admin section list — one array, one file. Adding a moderation surface is
 * an entry here plus a route; it must not mean editing every sibling page
 * (ADR 0035 / plan 0022).
 *
 * `/admin/profiles/:id` is a detail view, not a section. It does not appear
 * here; the review queue stays marked while it is open.
 */
export const ADMIN_SECTIONS = [
  { label: 'Review queue', path: '/admin' },
  { label: 'Media', path: '/admin/media' },
  { label: 'Accounts', path: '/admin/accounts' },
  { label: 'Ratings', path: '/admin/ratings' },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/**
 * Exact match for `/admin` so it does not light up on every `/admin/...` path;
 * `/admin/profiles/:id` keeps the review queue lit because that is the section
 * the detail belongs under. Every other section uses a prefix match.
 */
export function isAdminSectionActive(pathname: string, path: string): boolean {
  if (path === '/admin') {
    return pathname === '/admin' || pathname.startsWith('/admin/profiles/');
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
