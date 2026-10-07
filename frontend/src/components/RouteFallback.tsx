/**
 * Shown while a lazy route chunk arrives, and while the session is still being
 * resolved: a skeleton of the page being loaded, in the frame it will arrive
 * in (`page-skeleton/`). Inside `SiteLayout` the header is already up and only
 * the page is drawn; at the top of the routes the page's own chrome is drawn
 * too; in the messages split view, only the thread.
 *
 * Invisible for ~250ms, then fading in — a cached chunk must never flash.
 * CSS animation-delay, not a timer. Reduced motion keeps the delayed fade and
 * drops only the shimmer (plan 0030 audit).
 *
 * `generic` draws a plain page rather than the one at this address, for a wait
 * that must not show the shape of what is behind it (`RequireAdmin`).
 *
 * `slowAfterMs` adds one line once the wait stops looking like loading and
 * starts looking like breakage. The API sleeps on its free tier and can take
 * most of a minute to wake (plan 0002 phase 6), and half a minute of a still
 * skeleton is indistinguishable from a dead app.
 *
 * While the app is opening, none of this shows: the opening curtain is up
 * (`page-transition/boot.ts`), every fallback on screen holds it, and it lifts
 * only once they have all gone. It says the slow line itself. A page-transition
 * overlay waits for them the same way (`page-transition/loading.ts`).
 */

import { useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { boot, useBootPhase } from '@/components/page-transition/boot';
import { pageLoading } from '@/components/page-transition/loading';
import { PageSkeleton } from '@/components/page-skeleton/PageSkeleton';
import { FallbackScopeContext } from '@/components/page-skeleton/scope';
import { cn } from '@/lib/cn';

export function RouteFallback({
  generic = false,
  slowAfterMs,
}: {
  generic?: boolean;
  slowAfterMs?: number;
}) {
  const [slow, setSlow] = useState(false);
  const bootPhase = useBootPhase();
  const scope = useContext(FallbackScopeContext);
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const releaseBoot = boot.hold();
    const releasePage = pageLoading.hold();
    return () => {
      releaseBoot();
      releasePage();
    };
  }, []);

  useEffect(() => {
    if (!slowAfterMs) return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);

  const frame = scope === 'pane' ? 'lg:h-full' : 'min-h-page bg-paper';

  if (bootPhase === 'covering') return <div className={frame} />;

  return (
    <div
      className={cn('bk-route-fallback', frame)}
      style={{ opacity: 0, animation: 'bk-route-fallback-in 0.35s ease 0.25s forwards' }}
    >
      <span role="status" className="sr-only">
        Loading
      </span>
      <PageSkeleton
        pathname={pathname}
        scope={scope}
        generic={generic}
        notice={
          slow && (
            <p className="mx-auto max-w-xs px-6 pt-6 text-center text-sm text-ink-subtle">
              Still loading. The server may be waking up — this can take a minute.
            </p>
          )
        }
      />
    </div>
  );
}
