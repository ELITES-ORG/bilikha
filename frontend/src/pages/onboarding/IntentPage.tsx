import { Link, useSearchParams } from 'react-router-dom';
import { Container } from '@/components/ui';
import { safeReturnPath, withNextParam } from '@/lib/return-path';

/**
 * Immediate post-registration intent step. One question, two exits —
 * no dashboard, no stats, no wandering navigation.
 */
export function IntentPage() {
  const [searchParams] = useSearchParams();
  const next = safeReturnPath(searchParams.get('next'), '');
  const hireTo = next || '/directory';
  const offerTo = withNextParam('/welcome/profile', next || null);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
        </Container>
      </header>

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Step 1 of 2</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
            What brings you to Bilikha?
          </h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Choose one. You can always do the other later.
          </p>

          <div className="mt-10 grid gap-4">
            <Link
              to={hireTo}
              className="block rounded-sm border border-hairline-strong bg-surface px-6 py-5 transition-colors hover:border-lawa-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawa-100"
            >
              <span className="block text-lg font-medium text-ink">I&apos;m looking to hire</span>
              <span className="mt-1 block text-sm text-ink-muted">
                {next
                  ? 'Return to the creative you were contacting.'
                  : 'Browse the directory of Biliran creatives.'}
              </span>
            </Link>
            <Link
              to={offerTo}
              className="block rounded-sm border border-hairline-strong bg-surface px-6 py-5 transition-colors hover:border-lawa-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lawa-100"
            >
              <span className="block text-lg font-medium text-ink">
                I want to offer my creative work
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                Continue into profile setup — your listing is reviewed before it appears.
              </span>
            </Link>
          </div>
        </Container>
      </main>
    </div>
  );
}
