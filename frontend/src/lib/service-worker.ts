/**
 * The off switch for the service worker, and the thing that turns it on.
 *
 * A service worker is the only code Bilikha ships that outlives the page that
 * installed it. Ordinary code is fixed by deploying a fix; a worker keeps
 * running on somebody's phone until something removes it, and "clear your site
 * data" is not an instruction you can give a carpenter in Naval over Messenger.
 *
 * So the removal path exists first and does not depend on the worker behaving:
 * it lives in the page, which is always fetched from the network because
 * `index.html` is `max-age=0, must-revalidate`. Publishing `off` in
 * `/sw-enabled` unregisters the worker on every device that opens the app,
 * without a deploy.
 */

const FLAG_URL = '/sw-enabled';
const SW_URL = '/sw.js';

/**
 * A fetch failure must never read as `off`. A phone on a bad connection in
 * Biliran would otherwise unregister the worker every time the signal dropped,
 * which is the opposite of durable.
 */
async function killSwitchThrown(): Promise<boolean> {
  try {
    const response = await fetch(FLAG_URL, { cache: 'no-store' });
    if (!response.ok) return false;
    return (await response.text()).trim() !== 'on';
  } catch {
    return false;
  }
}

/** Remove every worker on this origin, and anything they cached. */
async function unregisterEverything(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Nothing registered, or the API is unavailable. Either way there is
    // nothing to remove.
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Same: absence is the desired state, so failing to delete nothing is fine.
  }
}

/**
 * Called once at startup, before anything registers a worker.
 *
 * Returns true when workers are permitted. Deliberately checked on every app
 * start rather than hourly: this is the lever that gets pulled when something
 * is wrong, and it should reach people on their next launch, not within the
 * hour. One request of a few bytes per page load, which for a single-page app
 * is a handful a day.
 */
export async function serviceWorkersPermitted(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  // An escape hatch for one person on one device, when the flag is still `on`
  // for everyone else: send them a link ending in ?sw=off.
  const forcedOff = new URLSearchParams(window.location.search).get('sw') === 'off';

  if (forcedOff || (await killSwitchThrown())) {
    await unregisterEverything();
    return false;
  }

  return true;
}

/**
 * Register the worker, if one is allowed and one exists.
 *
 * A missing `/sw.js` is not an error worth surfacing — it is the state this
 * code shipped in, deliberately, for one commit.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!(await serviceWorkersPermitted())) return;

  try {
    const head = await fetch(SW_URL, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return;
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    // A worker that will not register leaves the app exactly as it is without
    // one, which is a working app. Nothing to tell anybody.
  }
}
