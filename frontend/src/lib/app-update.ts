/**
 * Surviving a deploy while somebody has the app open.
 *
 * The app is split into route chunks with content-hashed filenames (plan 0031),
 * and every deploy produces new hashes. A phone in a pocket holds the old
 * `index.html` in memory; the moment its owner taps a route whose chunk that
 * build no longer has, the dynamic import fails. Nothing else recovers from
 * that — React unmounts the tree and the screen goes white.
 *
 * Two mechanisms here, in order of how often they fire:
 *
 * 1. **Recover from a failed chunk.** Reload once, which fetches the current
 *    `index.html` and with it the current hashes. One reload, guarded, because
 *    a reload loop against a genuinely broken deploy is worse than a blank page
 *    — it hammers the origin and never settles.
 *
 * 2. **Notice a new build before anything breaks.** A tab open for a week is
 *    running week-old code against a moving API. Checking a small stamp when
 *    the tab regains focus costs a couple of hundred bytes at most once an
 *    hour, which is defensible on metered data (constraint 3); polling on a
 *    timer is not.
 */

/** Written into the bundle at build time. See `vite.config.ts`. */
declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** Survives the reload it guards; cleared once the new build runs. */
const RELOAD_KEY = 'bilikha:chunk-reload';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let lastCheckedAt = 0;

/**
 * True for the several ways a browser reports "the script you asked for is not
 * the script that came back". Chrome, Safari and Firefox all word it
 * differently, and Vite adds its own event, so this matches on shape rather
 * than on any one string.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /expected a javascript.*module.*but the server responded with a mime type/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

/**
 * Reload, but only once per build. If the reload lands on a build that fails
 * the same way, the flag is still set and we stop, leaving the error boundary
 * to say something a person can act on.
 */
export function reloadForNewBuildOnce(): boolean {
  let already: string | null = null;
  try {
    already = sessionStorage.getItem(RELOAD_KEY);
  } catch {
    // Private mode or blocked storage. Without somewhere to record the attempt
    // a reload could loop, so treat it as already tried and show the message.
    return false;
  }

  if (already === BUILD_ID) return false;

  try {
    sessionStorage.setItem(RELOAD_KEY, BUILD_ID);
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

/** Called once the app has rendered, so a successful run clears the guard. */
export function clearReloadGuard(): void {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === BUILD_ID) return;
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Ask whether the deployed build is still the one running here.
 *
 * Reads `/build-id.txt`, written at build time — a few bytes, and `no-store` so
 * no layer between here and the origin can answer with what we already have.
 * Any failure means "cannot tell", never "out of date": an offline phone must
 * not be told to reload.
 */
export async function deployedBuildDiffers(): Promise<boolean> {
  try {
    const response = await fetch('/build-id.txt', { cache: 'no-store' });
    if (!response.ok) return false;
    const deployed = (await response.text()).trim();
    return Boolean(deployed) && deployed !== BUILD_ID;
  } catch {
    return false;
  }
}

/**
 * Check when the tab comes back to the foreground, at most hourly. Returns an
 * unsubscribe so a caller in React can clean up.
 */
export function watchForNewBuild(onNewBuild: () => void): () => void {
  async function check() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheckedAt < CHECK_INTERVAL_MS) return;
    lastCheckedAt = now;
    if (await deployedBuildDiffers()) onNewBuild();
  }

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  return () => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
  };
}
