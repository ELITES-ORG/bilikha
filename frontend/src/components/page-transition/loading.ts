import { useSyncExternalStore } from 'react';

/**
 * How many loading fallbacks are on screen. A page-transition overlay is the
 * loader while it is up: it lifts only once none are left, so it never reveals
 * the dots it was covering.
 */
let mounted = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export const pageLoading = {
  /** From a loading fallback's layout effect; returns the release. */
  hold(): () => void {
    mounted += 1;
    notify();
    return () => {
      mounted -= 1;
      // After the commit, not at the release: one commit can unmount one
      // fallback and mount the next, and the count passes through zero between.
      queueMicrotask(notify);
    };
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePageLoading(): boolean {
  return useSyncExternalStore(subscribe, () => mounted > 0);
}
