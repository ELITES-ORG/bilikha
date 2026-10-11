import type { AdminMediaRow } from '@contracts/admin';

/** `queue` is the server's own order: flagged items first, then the longest waiting. */
export type SortOrder = 'queue' | 'newest' | 'oldest';

/** How many items carry contact details in a description: they sort first. */
export function countFlagged(items: ReadonlyArray<AdminMediaRow>): number {
  return items.filter((item) => item.flaggedAt).length;
}

function matchesSearch(item: AdminMediaRow, query: string): boolean {
  if (!query) return true;
  const haystack = [item.ownerName, item.title, item.caption, item.description, item.subdomain]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

/**
 * One subject's list of waiting items, searched and ordered. Each list holds a
 * single kind (ADR 0059), so there is no kind filter to apply here.
 */
export function filterAndSortReview(
  items: ReadonlyArray<AdminMediaRow>,
  query: string,
  sort: SortOrder,
): AdminMediaRow[] {
  const needle = query.trim().toLowerCase();
  const filtered = items.filter((item) => matchesSearch(item, needle));
  if (sort === 'queue') return filtered;
  const direction = sort === 'newest' ? -1 : 1;
  return [...filtered].sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -direction : direction,
  );
}
