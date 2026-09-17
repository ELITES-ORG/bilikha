import { Link } from 'react-router-dom';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ButtonLink, Container, EmptyState, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useOwnProfile } from '@/features/me/api';
import type { ProfileStatus } from '@/features/me/types';
import { useOwnOffers } from '@/features/offers/api';
import { OFFER_LIMIT } from '@/features/offers/limits';
import { useMyPostings } from '@/features/postings/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

function profileStatusLabel(status: ProfileStatus): string {
  switch (status) {
    case 'published':
      return 'Published';
    case 'pending_review':
      return 'Pending review';
    case 'draft':
      return 'Draft';
    case 'suspended':
      return 'Suspended';
  }
}

function profileSummary(subdomainCount: number, status: ProfileStatus): string {
  const domains =
    subdomainCount === 1 ? '1 sub-domain' : `${subdomainCount} sub-domains`;
  return `${domains} · ${profileStatusLabel(status)}`;
}

function offersSummary(count: number | undefined): string {
  if (count == null) return '…';
  if (count === 0) return 'None yet';
  return `${count} of ${OFFER_LIMIT} used`;
}

function postingsSummary(openCount: number | undefined): string {
  if (openCount == null) return '…';
  if (openCount === 0) return 'None yet';
  return openCount === 1 ? '1 open' : `${openCount} open`;
}

function HubRow({
  to,
  label,
  summary,
}: {
  to: string;
  label: string;
  summary: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className={cn(
          'flex min-h-11 items-center justify-between gap-3 border-b border-hairline px-1 py-3',
          'text-left transition-colors hover:bg-clay-50',
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{label}</span>
          <span className="mt-0.5 block text-sm text-ink-muted">{summary}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
      </Link>
    </li>
  );
}

export function AccountPage() {
  const profile = useOwnProfile();
  const hasCreative = Boolean(profile.data);
  const offers = useOwnOffers(profile.isSuccess && hasCreative);
  const postings = useMyPostings();

  const openPostings = postings.data?.filter((p) => p.status === 'open').length;

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Account</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Your account</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Keep your public details and sign-in security up to date.
          </p>

          {profile.isPending && (
            <div className="mt-10 space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {profile.isError && (
            <div className="mt-10">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load your account"
                description={profile.error.message}
              />
            </div>
          )}

          {profile.isSuccess && (
            <>
              <ul className="mt-10 border-t border-hairline">
                <HubRow
                  to="/account/profile"
                  label="Profile"
                  summary={
                    profile.data
                      ? profileSummary(profile.data.subdomainSlugs.length, profile.data.status)
                      : 'Photo and creative profile setup'
                  }
                />
                {profile.data && (
                  <HubRow
                    to="/account/offers"
                    label="Offers"
                    summary={offersSummary(offers.data?.length)}
                  />
                )}
                <HubRow
                  to="/postings/mine"
                  label="Your postings"
                  summary={postingsSummary(openPostings)}
                />
                <HubRow
                  to="/account/security"
                  label="Security"
                  summary="Password and sign out"
                />
              </ul>

              {!profile.data && (
                <section className="mt-10" aria-labelledby="offer-work-heading">
                  <h2 id="offer-work-heading" className="u-display text-2xl text-ink">
                    Offer your creative work
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-ink-muted">
                    Add a creative profile to appear in the directory. It is reviewed
                    before it goes public — the same path as signing up to offer work.
                  </p>
                  <ButtonLink to="/welcome/profile?from=account" className="mt-5">
                    Set up your profile
                  </ButtonLink>
                </section>
              )}
            </>
          )}
        </Container>
      </main>
    </div>
  );
}
