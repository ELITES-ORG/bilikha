import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ButtonLink, Container, EmptyState, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCurrentUser } from '@/features/auth/api';
import type { ViewMode } from '@/features/auth/types';
import { useOwnProfile, useSetViewMode } from '@/features/me/api';
import type { ProfileStatus } from '@/features/me/types';
import { useOwnOffers } from '@/features/offers/api';
import { OFFER_LIMIT } from '@/features/offers/limits';
import { useMyPostings } from '@/features/postings/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/lib/theme-preference';
import { effectiveViewMode, MODE_LABEL } from '@/lib/view-mode';

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

const APPEARANCE_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function AppearanceRow() {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());

  function choose(next: ThemePreference) {
    setThemePreference(next);
    setPreference(next);
  }

  return (
    <li className="border-b border-hairline px-1 py-3">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Appearance</legend>
        <p className="mt-0.5 text-sm text-ink-muted">
          System follows your device. Light and Dark stay put.
        </p>
        <div
          role="radiogroup"
          aria-label="Appearance"
          className="mt-3 flex flex-wrap gap-1"
        >
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm',
                  selected
                    ? 'bg-clay-100 font-medium text-ink'
                    : 'text-ink-muted hover:bg-clay-50 hover:text-ink',
                )}
              >
                <input
                  type="radio"
                  name="appearance"
                  value={option.value}
                  checked={selected}
                  onChange={() => choose(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </li>
  );
}

const MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'hiring', label: MODE_LABEL.hiring },
  { value: 'creative', label: MODE_LABEL.creative },
];

/**
 * Account-wide mode. Layout mirrors AppearanceRow; value comes from the user
 * on the server (ADR 0038) — no local mirror of mode (house rule 5).
 */
function ModeRow() {
  const { data: user } = useCurrentUser();
  const setMode = useSetViewMode();

  if (!user?.profileSlug) return null;

  const mode = effectiveViewMode(user);

  function choose(next: ViewMode) {
    if (next === mode || setMode.isPending) return;
    void setMode.mutateAsync(next).catch(() => undefined);
  }

  return (
    <li className="border-b border-hairline px-1 py-3">
      <fieldset>
        <legend className="text-sm font-medium text-ink">Mode</legend>
        <p className="mt-0.5 text-sm text-ink-muted">
          Creative mode shows client postings on Home, and the clients who contacted
          you in Messages. Client mode shows offers and creatives you can hire.
        </p>
        <div
          role="radiogroup"
          aria-label="Mode"
          className="mt-3 flex flex-wrap gap-1"
        >
          {MODE_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-sm',
                  selected
                    ? 'bg-clay-100 font-medium text-ink'
                    : 'text-ink-muted hover:bg-clay-50 hover:text-ink',
                  setMode.isPending && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="view-mode"
                  value={option.value}
                  checked={selected}
                  disabled={setMode.isPending}
                  onChange={() => choose(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
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
                <AppearanceRow />
                <ModeRow />
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
