import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Bookmark,
  BriefcaseBusiness,
  ChevronRight,
  CircleCheck,
  Clock,
  Eye,
  FileText,
  LockKeyhole,
  LogOut,
  MapPin,
  PencilLine,
  Languages,
  SunMoon,
  TrendingUp,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { CreditsBar } from '@/components/CreditsBar';
import { InstallGuide } from '@/components/InstallGuide';
import { AccountSkeleton } from '@/components/page-skeleton/parts';
import { tapOrigin, transitionTo } from '@/components/page-transition/transition-to';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  Eyebrow,
  segmentItemClass,
  segmentTrackClass,
} from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import type { AuthUser, ViewMode } from '@/features/auth/types';
import { useOwnProfile, useSetViewMode } from '@/features/me/api';
import type { OwnProfile, ProfileStatus } from '@/features/me/types';
import { useOwnOffers } from '@/features/offers/api';
import { OFFER_LIMIT } from '@/features/offers/limits';
import { useMyPostings } from '@/features/postings/api';
import { useCreativeDomains } from '@/features/taxonomy/api';
import { subdomainLabel } from '@/features/taxonomy/format';
import type { CreativeDomain } from '@/features/taxonomy/types';
import { useWorkSummary } from '@/features/work/api';
import { nextAction } from '@/features/work/next-action';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '@/lib/theme-preference';
import { effectiveViewMode, MODE_LABEL } from '@/lib/view-mode';
import { LOCALES, type Locale } from '@/lib/locale';
import { useI18n } from '@/i18n/i18n-context';

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
  icon,
}: {
  to: string;
  label: string;
  summary: string;
  icon: ReactNode;
}) {
  return (
    <li>
      <Link
        to={to}
        className="group flex min-h-14 items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
      >
        <RowIcon>{icon}</RowIcon>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="mt-0.5 block text-sm text-ink-muted">{summary}</span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-ink-muted transition-transform motion-safe:group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}

/** Small navy icon in a soft circle — secondary to the label beside it. */
function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary-soft text-navy-700 [&_svg]:size-4"
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function HubCard({ title, children }: { title: string; children: ReactNode }) {
  const id = `hub-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <Card as="section" aria-labelledby={id} className="overflow-hidden">
      <h2 id={id} className="px-5 pt-5 pb-3 text-xl text-ink">
        {title}
      </h2>
      <ul className="divide-y divide-hairline border-t border-hairline">{children}</ul>
    </Card>
  );
}

/** Text on the left; the control beside it from sm, under it on a phone. */
function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <li className="px-5 py-4">
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-col gap-3"
      >
        <div className="flex min-w-0 items-start gap-4">
          <RowIcon>{icon}</RowIcon>
          <div className="min-w-0">
            <p id={labelId} className="text-sm font-semibold text-ink">
              {label}
            </p>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
        </div>
        <div className="sm:pl-13">{children}</div>
      </div>
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
    <SettingRow
      icon={<SunMoon />}
      label="Appearance"
      description="System follows your device. Light and Dark stay put."
    >
      <div role="radiogroup" aria-label="Appearance" className={cn(segmentTrackClass, 'flex w-full sm:inline-flex sm:w-auto')}>
        {APPEARANCE_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                segmentItemClass(selected),
                'flex-1 sm:flex-none',
                // The radio is visually hidden; its focus shows on the pill.
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
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
    </SettingRow>
  );
}

/**
 * Language. Layout mirrors AppearanceRow exactly (ADR 0055).
 *
 * Each option is labelled in its own language, never translated into the
 * current one: the person who needs this control is the one who cannot read
 * the English label, so "Filipino" must say Filipino whatever the interface
 * currently says.
 *
 * The description is honest about the state of it — most of the app is still
 * English, and finding that out by switching is worse than being told.
 */
function LanguageRow() {
  const { locale, choose, message } = useI18n();
  const label = message('account.language.label');
  const description = message('account.language.description');

  return (
    <SettingRow
      icon={<Languages />}
      label={<span lang={label.lang}>{label.text}</span>}
      description={<span lang={description.lang}>{description.text}</span>}
    >
      <div
        role="radiogroup"
        aria-label={label.text}
        lang={label.lang}
        className={cn(segmentTrackClass, 'flex w-full sm:inline-flex sm:w-auto')}
      >
        {LOCALES.map((option) => {
          const selected = locale === option.value;
          return (
            <label
              key={option.value}
              lang={option.value}
              className={cn(
                segmentItemClass(selected),
                'flex-1 sm:flex-none',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              )}
            >
              <input
                type="radio"
                name="language"
                value={option.value}
                checked={selected}
                onChange={() => choose(option.value as Locale)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </SettingRow>
  );
}

const MODE_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'hiring', label: MODE_LABEL.hiring },
  { value: 'creative', label: MODE_LABEL.creative },
];

/**
 * Account-wide mode. Layout mirrors AppearanceRow; value comes from the user
 * on the server (ADR 0038) — no local mirror of mode (house rule 5).
 * Explanation lives on ModeNotice and the empty-state switch, not here.
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
    <SettingRow icon={<ArrowLeftRight />} label="Mode">
      <div role="radiogroup" aria-label="Mode" className={cn(segmentTrackClass, 'flex w-full sm:inline-flex sm:w-auto')}>
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                segmentItemClass(selected),
                'flex-1 sm:flex-none',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
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
    </SettingRow>
  );
}

export function AccountPage() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const profile = useOwnProfile();
  const hasCreative = Boolean(profile.data);
  const offers = useOwnOffers(profile.isSuccess && hasCreative);
  const postings = useMyPostings();
  const work = useWorkSummary(profile.isSuccess && hasCreative);
  // Names for the professions line — the profile carries slugs only. Cached
  // indefinitely and usually already loaded by the directory.
  const domains = useCreativeDomains();

  const openPostings = postings.data?.filter((p) => p.status === 'open').length;
  const workSummaryLine =
    work.data != null ? nextAction(work.data).headline : work.isPending ? '…' : 'How things stand';
  // Saved offers are a hiring-side idea; History hides them in creative mode too.
  const creativeMode = effectiveViewMode(user) === 'creative' && Boolean(user?.profileSlug);

  return (
    <div className="bg-paper">
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container className="py-8 sm:py-(--section-gap)">
          <Eyebrow>Account</Eyebrow>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Your account</h1>
          <p className="mt-2 max-w-xl text-md text-ink-muted">
            Manage your profile, work, preferences and security.
          </p>

          {profile.isPending && <AccountSkeleton />}

          {profile.isError && (
            <div className="mt-8">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load your account"
                description={profile.error.message}
              />
            </div>
          )}

          {profile.isSuccess && user && (
            <>
              <ProfileSummary
                user={user}
                profile={profile.data}
                professions={professionsOf(profile.data, domains.data)}
              />

              <div className="mt-6 grid items-start gap-6 md:grid-cols-2">
                <HubCard title="Your activity">
                  {profile.data && (
                    <HubRow
                      to="/account/offers"
                      icon={<BriefcaseBusiness />}
                      label="Your offers"
                      summary={offersSummary(offers.data?.length)}
                    />
                  )}
                  <HubRow
                    to="/postings/mine"
                    icon={<FileText />}
                    label="Your postings"
                    summary={postingsSummary(openPostings)}
                  />
                  {!creativeMode && (
                    <HubRow
                      to="/history?segment=saved"
                      icon={<Bookmark />}
                      label="Saved offers"
                      summary="Offers you kept to come back to"
                    />
                  )}
                  {profile.data && (
                    <HubRow
                      to="/account/work"
                      icon={<TrendingUp />}
                      label="How your work is doing"
                      summary={workSummaryLine}
                    />
                  )}
                  <HubRow
                    to="/account/profile"
                    icon={<UserRound />}
                    label="Profile"
                    summary={
                      profile.data
                        ? profileSummary(profile.data.subdomainSlugs.length, profile.data.status)
                        : 'Photo and creative profile setup'
                    }
                  />
                </HubCard>

                <HubCard title="Settings">
                  <ModeRow />
                  <AppearanceRow />
                  <LanguageRow />
                  {/*
                    A choice about this device, like Appearance above it. Renders
                    nothing once installed, and nothing in a browser with no
                    install flow, so it is not a permanent fixture of the group.
                  */}
                  <InstallGuide />
                  <HubRow
                    to="/account/security"
                    icon={<LockKeyhole />}
                    label="Security"
                    summary="Password and sign out"
                  />
                </HubCard>
              </div>

              {/*
                From sm the header carries Sign out; on a phone the header has
                no room for it, so it sits here as well as under Security. Same
                hook as both of those, so it behaves identically.
              */}
              <div className="mt-6 sm:hidden">
                <Button
                  variant="secondary"
                  fullWidth
                  loading={logout.isPending}
                  iconLeft={<LogOut className="size-4" aria-hidden="true" />}
                  onClick={(event) => void logout.mutateAsync(tapOrigin(event))}
                >
                  Sign out
                </Button>
                <p className="mt-2 text-center text-xs text-ink-muted">
                  Ends this session on this device only.
                </p>
              </div>

              {!profile.data && (
                <section
                  className="mt-6 flex flex-col gap-5 rounded-lg border border-hairline bg-surface-sunken p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8"
                  aria-labelledby="offer-work-heading"
                >
                  <div className="max-w-xl">
                    <Eyebrow>Offer your creative work</Eyebrow>
                    <h2 id="offer-work-heading" className="mt-3 text-2xl text-ink">
                      Get discovered by people looking for creative professionals in Biliran.
                    </h2>
                    <p className="mt-2 text-sm text-ink-muted">
                      Add a creative profile to appear in the directory. It is reviewed
                      before it goes public — the same path as signing up to offer work.
                    </p>
                  </div>
                  <ButtonLink
                    to="/welcome/profile?from=account"
                    className="w-full shrink-0 sm:w-auto"
                    iconRight={<ArrowRight className="size-4" aria-hidden="true" />}
                  >
                    Set up your profile
                  </ButtonLink>
                </section>
              )}

              {/*
                Not a hub group: these are two documents to read, not settings
                to change, and giving them the weight of Profile or Security
                would misstate what they are. They sit below the groups, the
                way a footer does, so the account area has them without
                registration being the only place they are linked.
              */}
              <div className="mt-12 border-t border-hairline pt-6">
                <p className="flex gap-4 text-sm">
                  <Link
                    to="/privacy"
                    className="link-underline u-tap text-ink-muted"
                    onClick={transitionTo('wave')}
                  >
                    Privacy notice
                  </Link>
                  <Link
                    to="/terms"
                    className="link-underline u-tap text-ink-muted"
                    onClick={transitionTo('wave')}
                  >
                    Terms of use
                  </Link>
                </p>
                <CreditsBar className="mt-6" />
              </div>
            </>
          )}
        </Container>
      </main>
    </div>
  );
}

const STATUS_BADGE: Record<ProfileStatus, { tone: 'success' | 'warning' | 'neutral' | 'danger'; icon: ReactNode }> = {
  published: { tone: 'success', icon: <CircleCheck className="size-3.5" aria-hidden /> },
  pending_review: { tone: 'warning', icon: <Clock className="size-3.5" aria-hidden /> },
  draft: { tone: 'neutral', icon: <PencilLine className="size-3.5" aria-hidden /> },
  suspended: { tone: 'danger', icon: <Ban className="size-3.5" aria-hidden /> },
};

/** Primary craft first, names resolved from the taxonomy. */
function professionsOf(profile: OwnProfile | null, domains: CreativeDomain[] | undefined): string[] {
  if (!profile || !domains) return [];
  const names = new Map(
    domains.flatMap((d) => d.subdomains.map((s) => [s.slug, subdomainLabel(s)] as const)),
  );
  const ordered = [...profile.subdomainSlugs].sort(
    (a, b) => Number(b === profile.primarySubdomainSlug) - Number(a === profile.primarySubdomainSlug),
  );
  return ordered.map((slug) => names.get(slug)).filter((name): name is string => Boolean(name));
}

function ProfileSummary({
  user,
  profile,
  professions,
}: {
  user: AuthUser;
  profile: OwnProfile | null;
  professions: string[];
}) {
  const name = profile?.displayName || `${user.firstName} ${user.lastName}`;
  const published = profile?.status === 'published' && user.profileSlug;
  const status = profile ? STATUS_BADGE[profile.status] : null;

  return (
    <Card as="section" aria-label="Your profile" className="mt-8 p-5 sm:flex sm:gap-6 sm:p-8">
      <Avatar src={user.avatarUrl} name={name} size="lg" className="sm:size-28" />
      <div className="mt-4 min-w-0 flex-1 sm:mt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="u-display text-2xl break-words text-ink">{name}</p>
          {profile && status && (
            <Badge tone={status.tone} icon={status.icon}>
              {profileStatusLabel(profile.status)}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">@{user.username}</p>
        {professions.length > 0 && (
          <p className="mt-3 font-semibold text-ink">{professions.join(' · ')}</p>
        )}
        {user.municipalityName && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin className="size-4 text-red-500" aria-hidden="true" />
            {user.municipalityName}, Biliran
          </p>
        )}
        {profile?.bio && (
          <p className="mt-3 line-clamp-3 max-w-prose text-sm text-ink-muted">{profile.bio}</p>
        )}
        {profile && !published && (
          // The public page serves published profiles only, so there is no
          // View button yet — say why rather than leave it missing.
          <p className="mt-3 text-sm text-ink-muted">
            Your profile goes public once it has been reviewed.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:mt-0 sm:w-44 sm:shrink-0">
        {published && (
          <ButtonLink
            to={`/creatives/${user.profileSlug}`}
            fullWidth
            iconLeft={<Eye className="size-4" aria-hidden="true" />}
          >
            View profile
          </ButtonLink>
        )}
        <ButtonLink
          to="/account/profile"
          variant="secondary"
          fullWidth
          iconLeft={<PencilLine className="size-4" aria-hidden="true" />}
        >
          {profile ? 'Edit profile' : 'Edit account details'}
        </ButtonLink>
      </div>
    </Card>
  );
}
