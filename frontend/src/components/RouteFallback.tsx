/**
 * Shown while a lazy route chunk arrives. BottomNav lives outside Suspense;
 * SiteHeader is included here so product pages do not lose the top chrome
 * while a chunk loads (plan 0031).
 *
 * Invisible for ~250ms, then fading in — a cached chunk must never flash.
 * CSS animation-delay, not a timer. Reduced motion keeps the delayed fade and
 * drops only the pulse (plan 0030 audit).
 */

import { SiteHeader } from '@/components/SiteHeader';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

export function RouteFallback() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <div
        className={cn(pbBottomNav, 'flex min-h-[50dvh] items-center justify-center')}
        role="status"
      >
        <div
          className="bk-route-fallback flex items-center gap-2 text-ink-muted"
          style={{
            opacity: 0,
            animation: 'bk-route-fallback-in 0.35s ease 0.25s forwards',
          }}
        >
          <i
            aria-hidden
            className="bk-route-fallback-dot block size-1.5 rounded-full bg-current"
            style={{ animation: 'bk-route-fallback-pulse 1.6s ease-in-out 0.25s infinite' }}
          />
          <i
            aria-hidden
            className="bk-route-fallback-dot block size-1.5 rounded-full bg-current"
            style={{ animation: 'bk-route-fallback-pulse 1.6s ease-in-out 0.4s infinite' }}
          />
          <i
            aria-hidden
            className="bk-route-fallback-dot block size-1.5 rounded-full bg-current"
            style={{ animation: 'bk-route-fallback-pulse 1.6s ease-in-out 0.55s infinite' }}
          />
          <span className="sr-only">Loading</span>
        </div>
      </div>
    </div>
  );
}
