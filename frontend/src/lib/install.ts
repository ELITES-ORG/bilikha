/**
 * Where the browser keeps its "install this" button, so the app can point at it.
 *
 * Bilikha ships no service worker (plan 0036 phase 1), and Chrome only fires
 * `beforeinstallprompt` for sites that have one with a `fetch` handler. So the
 * app cannot offer a button that installs it — the button lives in browser
 * chrome, where most people never look. What it can do is say where.
 *
 * Kept as a pure function of the user agent so it can be tested, because the
 * failure here is silent and specific: telling somebody to tap a menu item
 * their browser does not have is worse than saying nothing.
 */

export type InstallHint = 'ios' | 'android' | 'desktop' | 'none';

/**
 * `none` covers two different cases on purpose — already installed, and a
 * browser that cannot install — because the advice in both is the same: none.
 *
 * Firefox is deliberately `none`. It has no install flow on desktop or Android,
 * and pointing at a menu item that does not exist sends someone hunting through
 * settings for something that was never there.
 */
export function installHint(userAgent: string, isStandalone: boolean): InstallHint {
  if (isStandalone) return 'none';

  const ua = userAgent.toLowerCase();

  // iPadOS reports itself as a Mac; the touch check is what separates them.
  const isIos = /iphone|ipod|ipad/.test(ua);
  if (isIos) return 'ios';

  if (/firefox|fxios/.test(ua)) return 'none';

  if (/android/.test(ua)) return 'android';

  // Desktop Safari can add a site to the Dock, but by a different route and
  // only on recent macOS. Not worth a fourth set of words that may be wrong.
  const isDesktopSafari = /safari/.test(ua) && !/chrome|chromium|edg|opr/.test(ua);
  if (isDesktopSafari) return 'none';

  return 'desktop';
}

/** True when the page is already running as an installed app. */
export function isRunningInstalled(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS Safari predates display-mode and uses its own flag.
    return (window.navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
