import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';
import {
  readScrollPositions,
  scrollEntryKey,
  startsAtTop,
  writeScrollPositions,
} from '@/lib/scroll-on-navigate';

/** How long a restore keeps waiting for the page to grow tall enough. */
const RESTORE_TIMEOUT_MS = 10_000;

/** Any of these means the reader has taken over, and a restore stops. */
const READER_INPUT = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Scrolls to `top`, and keeps trying as the page grows until it can get there:
 * a lazy page, or one still loading its data, is too short to reach the old
 * offset at first. Gives up after a while, or as soon as the reader scrolls.
 * Returns a cancel.
 */
function restoreScroll(top: number): () => void {
  const reached = () => Math.abs(window.scrollY - top) < 2;
  window.scrollTo({ top, left: 0, behavior: 'instant' });
  if (reached()) return () => {};

  const observer = new ResizeObserver(() => {
    window.scrollTo({ top, left: 0, behavior: 'instant' });
    if (reached()) stop();
  });
  const timer = window.setTimeout(stop, RESTORE_TIMEOUT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of READER_INPUT) window.removeEventListener(type, stop);
  }
  observer.observe(document.body);
  for (const type of READER_INPUT) window.addEventListener(type, stop, { passive: true });
  return stop;
}

/**
 * Opens each newly visited page at the top, and puts back, forward and a
 * reload where the reader was. Renders nothing.
 *
 * The browser's own restoration is switched off: it moves the old page to the
 * new offset the moment back is pressed, which would show while the page
 * transition's curtain is still coming down. Positions are kept per history
 * entry, in session storage so a reload or a return from another site keeps
 * them, and restored once the page underneath has actually changed.
 *
 * A layout effect, so the jump happens before the new page paints rather than
 * after a frame of it at the old offset. `instant` overrides the site-wide
 * smooth scrolling, which would otherwise visibly scroll the new page.
 */
export function ScrollOnNavigate() {
  const { pathname, search, key } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef<string | null>(null);
  const currentEntry = useRef(scrollEntryKey(key, pathname, search));
  const positions = useRef<Map<string, number> | null>(null);
  positions.current ??= readScrollPositions(sessionStore());

  useEffect(() => {
    const { history } = window;
    history.scrollRestoration = 'manual';
    const saved = positions.current!;
    const remember = () => {
      // Re-inserted, so the most recently used entries are the ones kept.
      saved.delete(currentEntry.current);
      saved.set(currentEntry.current, window.scrollY);
    };
    // A reload, leaving the site, and a phone putting the tab away all pass
    // through one of these; in-app navigation keeps the record in memory.
    const persist = () => writeScrollPositions(sessionStore(), saved);
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persistWhenHidden);
    return () => {
      window.removeEventListener('scroll', remember);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persistWhenHidden);
      persist();
      history.scrollRestoration = 'auto';
    };
  }, []);

  useLayoutEffect(() => {
    const entry = scrollEntryKey(key, pathname, search);
    currentEntry.current = entry;
    const saved = positions.current!.get(entry);
    let cancel = () => {};
    if (previousPathname.current === null) {
      // The page the tab loaded: put a reload back where it was.
      if (saved !== undefined) cancel = restoreScroll(saved);
    } else if (navigationType === NavigationType.Pop) {
      cancel = restoreScroll(saved ?? 0);
    } else if (startsAtTop(previousPathname.current, pathname, navigationType)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    previousPathname.current = pathname;
    return cancel;
  }, [pathname, search, key, navigationType]);

  return null;
}
