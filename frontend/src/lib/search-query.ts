/**
 * What a search box sends as `q` (issue #22). The API refuses one character
 * and anything past 100, so the box never asks it to: too short is no search,
 * too long is cut.
 */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export function normalizeSearch(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_LENGTH).trim();
  return text.length >= SEARCH_MIN_LENGTH ? text : undefined;
}
