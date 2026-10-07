import type { PageTransitionKind } from '@/components/page-transition/transition-to';

/**
 * Which overlay brought each history entry on screen, so back and forward can
 * replay it in reverse. Session storage rather than memory: held only in
 * memory, the record was lost on a reload, and back then fell through to the
 * wave — a bloom page left by a quick wave instead of the bloom it came in by.
 */
export const ARRIVED_BY_STORAGE_KEY = 'bilikha-arrived-by';

/** Only the most recent entries are kept, so the record never grows unbounded. */
export const MAX_ARRIVED_BY_ENTRIES = 50;

const KINDS: ReadonlySet<string> = new Set<PageTransitionKind>(['wave', 'bloom', 'panel']);

/**
 * One history entry. The path is part of it: a tab that lands on a typed URL
 * starts again at React Router's `default` key, and must not inherit the
 * overlay of a different page that once had that key.
 */
export function arrivedByKey(historyKey: string, pathname: string): string {
  return `${historyKey} ${pathname}`;
}

/** Reads the record. Anything missing, blocked or malformed reads as empty. */
export function readArrivedBy(
  storage: Pick<Storage, 'getItem'> | null,
): Map<string, PageTransitionKind> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(ARRIVED_BY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(
        (entry): entry is [string, PageTransitionKind] =>
          Array.isArray(entry) && typeof entry[0] === 'string' && KINDS.has(entry[1] as string),
      ),
    );
  } catch {
    return new Map();
  }
}

/**
 * Saves the most recent entries, in insertion order. A full or blocked storage
 * is ignored: the record then lasts until the next reload, as it used to.
 */
export function writeArrivedBy(
  storage: Pick<Storage, 'setItem'> | null,
  record: Map<string, PageTransitionKind>,
): void {
  try {
    storage?.setItem(
      ARRIVED_BY_STORAGE_KEY,
      JSON.stringify([...record].slice(-MAX_ARRIVED_BY_ENTRIES)),
    );
  } catch {
    // Private mode, quota or a blocked storage: the record stays in memory only.
  }
}
