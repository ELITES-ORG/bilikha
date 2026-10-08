import type { AdminMediaRow } from '@contracts/admin';

export type KindFilter = 'all' | AdminMediaRow['kind'];
/** `queue` is the server's own order: flagged offers first, then newest. */
export type SortOrder = 'queue' | 'newest' | 'oldest';

export function countMedia(items: ReadonlyArray<AdminMediaRow>) {
  return {
    avatar: items.filter((item) => item.kind === 'avatar').length,
    offer: items.filter((item) => item.kind === 'offer').length,
    flagged: items.filter((item) => item.flaggedAt).length,
  };
}

function matchesSearch(item: AdminMediaRow, query: string): boolean {
  if (!query) return true;
  const haystack = [item.ownerName, item.title, item.caption, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterAndSortMedia(
  items: ReadonlyArray<AdminMediaRow>,
  kind: KindFilter,
  query: string,
  sort: SortOrder,
): AdminMediaRow[] {
  const needle = query.trim().toLowerCase();
  const filtered = items.filter(
    (item) => (kind === 'all' || item.kind === kind) && matchesSearch(item, needle),
  );
  if (sort === 'queue') return filtered;
  const direction = sort === 'newest' ? -1 : 1;
  return [...filtered].sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -direction : direction,
  );
}
