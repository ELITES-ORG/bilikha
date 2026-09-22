/**
 * Shown while a lazy route chunk arrives, and while the session is still being
 * resolved. BottomNav lives outside Suspense; SiteHeader is included here so
 * product pages do not lose the top chrome while a chunk loads (plan 0031).
 *
 * Invisible for ~250ms, then fading in — a cached chunk must never flash.
 * CSS animation-delay, not a timer. Reduced motion keeps the delayed fade and
 * drops only the pulse (plan 0030 audit).
 *
 * `chrome={false}` for the session case: until `/auth/me` answers, nobody knows
 * who this is, and a header offering **Sign in** to somebody who is signed in
 * is worse than no header at all.
 *
 * `slowAfterMs` adds one line once the wait stops looking like loading and
 * starts looking like breakage. The API sleeps on its free tier and can take
 * most of a minute to wake (plan 0002 phase 6), and half a minute of silent
 * dots is indistinguishable from a dead app.
 */

import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

export function RouteFallback({
  chrome = true,
  slowAfterMs,
}: {
  chrome?: boolean;
  slowAfterMs?: number;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!slowAfterMs) return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [slowAfterMs]);

  return (
    <div className="min-h-dvh bg-paper">
      {chrome && <SiteHeader />}
      <div
        className={cn(pbBottomNav, 'flex min-h-[50dvh] flex-col items-center justify-center gap-4')}
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

        {slow && (
          <p className="max-w-xs px-6 text-center text-sm text-ink-subtle">
            Still loading. The server may be waking up — this can take a minute.
          </p>
        )}
      </div>
    </div>
  );
}
