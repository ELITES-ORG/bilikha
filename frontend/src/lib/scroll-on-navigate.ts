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
