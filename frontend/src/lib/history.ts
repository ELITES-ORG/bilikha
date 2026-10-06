/**
 * Whether Back can stay inside Bilikha, read from `window.history.state`.
 *
 * React Router keeps an `idx` in each history entry: 0 for the page the tab
 * landed on, one more for every push. A `replace` (a tab switch, a filter)
 * keeps the index. `location.key !== 'default'` looked like the same test but
 * is not: every navigation, replace included, gets a fresh key, so one tab tap
 * on a page opened from a shared link made `navigate(-1)` leave the site.
 */
export function canGoBackInApp(historyState: unknown): boolean {
  if (typeof historyState !== 'object' || historyState === null) return false;
  const idx = (historyState as { idx?: unknown }).idx;
  return typeof idx === 'number' && idx > 0;
}
