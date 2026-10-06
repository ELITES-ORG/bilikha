import { useSyncExternalStore } from 'react';

/**
 * The opening curtain (ADR 0034, third amendment). `index.html` draws it before
 * any script runs; `BootCurtain` takes it over in the same frame React mounts,
 * holds it while any loading fallback is on screen, then lifts it with the
 * wave onto the first real page. After that it never returns: later loading
 * states are the ordinary `RouteFallback`.
 *
 * - covering:  something is still loading behind the curtain
 * - revealing: the first page is in; the wave is lifting
 * - done:      gone for the rest of the visit
 */
export type BootPhase = 'covering' | 'revealing' | 'done';

/**
 * When the boot curtain in `index.html` starts to fade in; keep in step with
 * its `bk-boot-in` delay, as `.boot-curtain` in motion.css keeps the duration.
 * A load that finishes sooner never shows a curtain at all.
 */
const BOOT_SHOW_MS = 400;

/**
 * The React curtain's fade-in delay, measured from the start of the page load
 * like the one in `index.html`. Usually negative: the fade is already under
 * way, or over, when React mounts, and the handover must not restart it.
 */
export const bootFadeDelayMs = BOOT_SHOW_MS - performance.now();

let phase: BootPhase = 'covering';
let waiting = 0;
const listeners = new Set<() => void>();

function set(next: BootPhase) {
  if (phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

// Checked after the commit, not at the release: one commit can unmount one
// fallback and mount the next, and the count passes through zero between.
function settle() {
  if (waiting > 0 || phase !== 'covering') return;
  set(performance.now() > BOOT_SHOW_MS ? 'revealing' : 'done');
}

export const boot = {
  /** From a loading fallback's layout effect; returns the release. */
  hold(): () => void {
    if (phase !== 'covering') return () => {};
    waiting += 1;
    return () => {
      waiting -= 1;
      queueMicrotask(settle);
    };
  },
  /** From `BootCurtain` once mounted, for a load that never held at all. */
  settleSoon() {
    queueMicrotask(settle);
  },
  finish() {
    set('done');
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useBootPhase(): BootPhase {
  return useSyncExternalStore(subscribe, () => phase);
}
