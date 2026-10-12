import type { AdminMediaRow } from '@contracts/admin';
import type { MediaKind } from '@contracts/media';

/** `queue` is the server's own order: flagged items first, then the longest waiting. */
export type SortOrder = 'queue' | 'newest' | 'oldest';

/** How many items carry contact details in a description: they sort first. */
export function countFlagged(items: ReadonlyArray<AdminMediaRow>): number {
  return items.filter((item) => item.flaggedAt).length;
}

/** Singular and plural, in the order a change is described. */
const MEDIA_NOUNS: ReadonlyArray<[MediaKind, string, string]> = [
  ['image', 'photo', 'photos'],
  ['audio', 'audio', 'audio'],
  ['video', 'video', 'videos'],
  ['document', 'PDF', 'PDFs'],
];

/**
 * For a change: what it does to the offer's media, in a few words —
 * "1 photo added, 1 audio removed, 1 video added". Null when it changes none.
 */
export function mediaChanges(item: AdminMediaRow): string | null {
  const media = item.images ?? [];
  const parts: string[] = [];
  for (const [kind, one, many] of MEDIA_NOUNS) {
    for (const [state, verb] of [['pending_add', 'added'], ['pending_remove', 'removed']] as const) {
      const n = media.filter((entry) => entry.kind === kind && entry.state === state).length;
      if (n) parts.push(`${n} ${n === 1 ? one : many} ${verb}`);
    }
  }
  return parts.length ? parts.join(', ') : null;
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
