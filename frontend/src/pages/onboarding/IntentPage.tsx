import { Link, useSearchParams } from 'react-router-dom';
import { Container, Eyebrow } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { isBrowseOnly } from '@/features/verification/status';
import { safeReturnPath, withNextParam } from '@/lib/return-path';

/**
 * Immediate post-registration intent step, after the ID step. One question,
 * two exits — no dashboard, no stats, no wandering navigation.
 *
 * Right after registering the ID is still being checked, so a creative profile
 * cannot be saved yet (ADR 0057). Rather than open a form that cannot be sent,
 * the creative choice says so and continues; the "ID verified" banner links to
 * profile setup once it can be.
 */
export function IntentPage() {
  const [searchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const next = safeReturnPath(searchParams.get('next'), '');
  const hireTo = next || '/directory';
  const waitingForId = isBrowseOnly(user);
  const offerTo = waitingForId ? hireTo : withNextParam('/welcome/profile', next || null);

  return (
    <div className="min-h-page bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
        </Container>
      </header>

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <Eyebrow>Step 2 of 3</Eyebrow>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
            What brings you to Bilikha?
          </h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Choose one. You can always do the other later.
          </p>

          <div className="mt-10 grid gap-4">
            <Link
              to={hireTo}
              className="block rounded-sm border border-hairline-strong bg-surface px-6 py-5 transition-colors hover:border-navy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-100"
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
              className="block rounded-sm border border-hairline-strong bg-surface px-6 py-5 transition-colors hover:border-navy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-100"
            >
              <span className="block text-lg font-medium text-ink">
                I want to offer my creative work
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                {waitingForId
                  ? 'You can set up your creative profile once your ID is verified. We’ll show you where when it is.'
                  : 'Continue into profile setup — your listing is reviewed before it appears.'}
              </span>
            </Link>
          </div>
        </Container>
      </main>
    </div>
  );
}
