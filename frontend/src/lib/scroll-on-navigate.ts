import { NavigationType } from 'react-router-dom';

/**
 * Whether a route change should open the new page at the top.
 *
 * `BrowserRouter` does no scroll handling (`<ScrollRestoration>` needs a data
 * router), so the window kept the old page's offset: a link near the bottom of
 * one page opened the next page at its bottom.
 *
 * Only a different page counts. A changed query string is the same page
 * refiltered and keeps its place; back and forward restore where the reader
 * was (`ScrollOnNavigate`).
 */
export function startsAtTop(
  previousPathname: string | null,
  pathname: string,
  navigationType: NavigationType,
): boolean {
  if (previousPathname === null || previousPathname === pathname) return false;
  return navigationType !== NavigationType.Pop;
}

/**
 * Where scroll positions are kept, per tab. Session storage rather than
 * memory, because the browser's own restoration is switched off: a position
 * held only in memory was lost on a reload, or when someone left for another
 * site and came back to a full page load, and the page then opened at the top.
 */
export const SCROLL_STORAGE_KEY = 'bilikha-scroll';

/** Only the most recent entries are kept, so the record never grows unbounded. */
export const MAX_SCROLL_ENTRIES = 50;

/**
 * One history entry's position. The path is part of it: a tab that lands on a
 * typed URL starts again at React Router's `default` key, and must not inherit
 * the position of a different page that once had that key.
 */
export function scrollEntryKey(historyKey: string, pathname: string, search: string): string {
  return `${historyKey} ${pathname}${search}`;
}

/** Reads the saved positions. Anything missing, blocked or malformed reads as none. */
export function readScrollPositions(storage: Pick<Storage, 'getItem'> | null): Map<string, number> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SCROLL_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'number' &&
          Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return new Map();
  }
}

/**
 * Saves the most recent positions, in insertion order. Callers re-insert an
 * entry when it changes, so the newest are last. A full or blocked storage is
 * ignored: restoring scroll is a nicety, never worth an error.
 */
export function writeScrollPositions(
  storage: Pick<Storage, 'setItem'> | null,
  positions: Map<string, number>,
): void {
  try {
    storage?.setItem(
      SCROLL_STORAGE_KEY,
      JSON.stringify([...positions].slice(-MAX_SCROLL_ENTRIES)),
    );
  } catch {
    // Private mode, quota or a blocked storage: positions stay in memory only.
  }
}
