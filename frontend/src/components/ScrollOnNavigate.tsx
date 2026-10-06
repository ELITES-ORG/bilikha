import { useEffect, useLayoutEffect, useRef } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';
import { startsAtTop } from '@/lib/scroll-on-navigate';

/**
 * Opens each newly visited page at the top, and puts back and forward where
 * the reader was. Renders nothing.
 *
 * The browser's own restoration is switched off: it moves the old page to the
 * new offset the moment back is pressed, which would show while the page
 * transition's curtain is still coming down. Positions are kept per history
 * entry and restored once the page underneath has actually changed.
 *
 * A layout effect, so the jump happens before the new page paints rather than
 * after a frame of it at the old offset. `instant` overrides the site-wide
 * smooth scrolling, which would otherwise visibly scroll the new page.
 */
export function ScrollOnNavigate() {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef<string | null>(null);
  const currentKey = useRef(key);
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    const { history } = window;
    history.scrollRestoration = 'manual';
    const remember = () => positions.current.set(currentKey.current, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      window.removeEventListener('scroll', remember);
      history.scrollRestoration = 'auto';
    };
  }, []);

  useLayoutEffect(() => {
    currentKey.current = key;
    if (previousPathname.current !== null && navigationType === NavigationType.Pop) {
      const top = positions.current.get(key) ?? 0;
      window.scrollTo({ top, left: 0, behavior: 'instant' });
    } else if (startsAtTop(previousPathname.current, pathname, navigationType)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    previousPathname.current = pathname;
  }, [pathname, key, navigationType]);

  return null;
}
