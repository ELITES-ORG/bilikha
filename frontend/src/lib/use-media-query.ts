import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, kept in step as it changes.
 *
 * For when hiding with a class is not enough — a hidden component still
 * mounts, and a mounted component still fetches. Pass the same query the
 * markup's breakpoint uses (`lg` is `(min-width: 64rem)`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
