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
 * Pinned and measured by `PinnedBanners`, which holds it.
 */
export function StagingBanner() {
  if (isProductionHost(window.location.hostname)) return null;

  return (
    <div role="note" className="border-b border-warning-500 bg-warning-100 text-ink">
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
