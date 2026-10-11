import { useLayoutEffect, useRef } from 'react';
import { StagingBanner } from '@/components/StagingBanner';
import { VerificationBanner } from '@/features/verification/VerificationBanner';

/**
 * The strips pinned across the top of every page: staging's, and an account's
 * ID verification (ADR 0057). Rendered once in App, outside the routes, so no
 * page can lose them.
 *
 * Only this wrapper is sticky, and it publishes its whole height as
 * `--staging-banner-h`, which the sticky headers, the top-anchored notices and
 * `min-h-page` offset by. One measurement for both strips, so they stack
 * instead of covering each other, and 0px when neither shows. Measured rather
 * than fixed because the copy wraps on the narrowest phones.
 */
export function PinnedBanners() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--staging-banner-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--staging-banner-h');
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-40 short:static">
      <StagingBanner />
      <VerificationBanner />
    </div>
  );
}
