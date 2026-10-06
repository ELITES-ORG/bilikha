import { useLayoutEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Container } from '@/components/ui';
import { isProductionHost, PRODUCTION_ORIGIN } from '@/lib/site-host';

/**
 * A strip across the top of every page that is not the live site.
 *
 * Staging looks exactly like production and anyone with the link can register
 * on it, so without this a tester can enter real data into staging, or test on
 * production, and not notice. Shown on staging, pull request previews and
 * local development; never on `bilikha.vercel.app` — see `site-host.ts`.
 *
 * Sticky, so it stays in view. It publishes its height as
 * `--staging-banner-h`, which the sticky headers, the top-anchored notices and
 * `min-h-page` offset by, so it never covers the header and never makes a
 * full-height screen scroll. Measured rather than fixed because the copy wraps
 * on the narrowest phones. Rendered once in App, outside the routes.
 */
export function StagingBanner() {
  if (isProductionHost(window.location.hostname)) return null;
  return <Banner />;
}

function Banner() {
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
    <div
      ref={ref}
      role="note"
      className="sticky top-0 z-40 short:static border-b border-warning-500 bg-warning-100 text-ink"
    >
      <Container
        width="wide"
        className="flex items-center justify-center gap-x-2 py-1.5 text-center text-xs"
      >
        <TriangleAlert className="size-4 shrink-0 text-warning-700" aria-hidden="true" />
        <p className="text-pretty">
          <strong className="font-semibold">Staging</strong> — test data, not the live site.{' '}
          <a href={PRODUCTION_ORIGIN} className="font-semibold whitespace-nowrap underline">
            Go to Bilikha
          </a>
        </p>
      </Container>
    </div>
  );
}
