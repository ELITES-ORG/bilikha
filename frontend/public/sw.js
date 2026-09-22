/* eslint-env serviceworker */

/**
 * Bilikha's service worker. It caches nothing, on purpose.
 *
 * Why it exists at all: a website cannot offer its own Install button unless
 * the browser fires `beforeinstallprompt`, and Chrome only fires that for a
 * site with a registered worker that has a `fetch` handler. Without one, the
 * only way in is a control in browser chrome that most people never find —
 * which is exactly what happened when this was tried (plan 0036 step 1.3).
 *
 * Why it does nothing: the whole of ADR 0040 is about a deploy reaching an open
 * tab. Every cached response is another copy of the old build that has to be
 * invalidated correctly, and the failure mode is a phone stuck on a version
 * nobody can reach. Offline support is worth having and is worth doing
 * deliberately (plan 0036 phase 2 proper); it is not worth acquiring by
 * accident as a side effect of wanting a button.
 *
 * So the `fetch` handler below is empty. It never calls `respondWith`, which
 * means every request goes to the network exactly as if no worker existed.
 * That is the point: this worker cannot break a request it never touches.
 */

const KILL_FLAG = '/sw-enabled';

self.addEventListener('install', () => {
  // Nothing to pre-cache, so there is nothing to wait for. Taking over at once
  // is safe precisely because no cached asset can disagree with the page.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();

      // Defensive: if a future version ever caches and is then rolled back to
      // this one, its caches would otherwise outlive it with nothing left to
      // invalidate them.
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // No Cache Storage, or nothing to delete. Both are the desired state.
      }

      // Second line of the off switch. The first lives in the page, which is
      // the one that works when the worker does not; this one catches a client
      // that somehow activates a worker after the flag was turned off.
      try {
        const response = await fetch(KILL_FLAG, { cache: 'no-store' });
        if (response.ok && (await response.text()).trim() !== 'on') {
          await self.registration.unregister();
        }
      } catch {
        // A failed check is not a reason to unregister — see the page-side
        // note. Offline must never read as "turn yourself off".
      }
    })(),
  );
});

/**
 * Required for `beforeinstallprompt`, and deliberately inert.
 *
 * Do not make this respond. The moment it does, Bilikha has a cache that can
 * serve an old build, and the update guarantees in ADR 0040 stop being true.
 */
self.addEventListener('fetch', () => {});

/** Lets the page remove the worker without waiting for the flag to be read. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'BILIKHA_SW_KILL') {
    event.waitUntil(self.registration.unregister());
  }
});
