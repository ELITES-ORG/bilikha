import type { ReactNode } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { SiteHeader } from '@/components/SiteHeader';
import { Container, Skeleton } from '@/components/ui';
import { OfferCardSkeleton, offerGridClass } from '@/features/offers/OfferCard';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';
import { Wordmark } from '@/components/Wordmark';
import {
  AccountHeadingShape,
  AccountSkeleton,
  AgreementSkeleton,
  ButtonShape,
  ConversationRowsSkeleton,
  DomainListSkeleton,
  EyebrowLine,
  Field,
  ListRowsSkeleton,
  NotificationRowsSkeleton,
  OfferDetailSkeleton,
  PageIntroShape,
  PageMain,
  PostingDetailSkeleton,
  PostingRowsSkeleton,
  ProfileSetupSkeleton,
  ProfileSkeleton,
  SectionHeadingShape,
  TabsShape,
  Text,
  ThreadSkeleton,
} from './parts';
import type { FallbackScope } from './scope';

/*
 * What a loading fallback shows: the page being loaded, drawn in grey, in the
 * frame it will arrive in. Each body follows its page's layout, and where the
 * page has a loading state of its own the body ends in that same state, so the
 * hand-over from fallback to page moves nothing but the text arriving.
 */

/** The chrome around a page, drawn only when the fallback replaces it too. */
type Shell = 'site' | 'landing' | 'auth' | 'onboarding' | 'admin' | 'bare';

type Route = readonly [matches: (path: string) => boolean, shell: Shell, Body: () => ReactNode];

const is = (target: string) => (path: string) => path === target;
const under = (prefix: string) => (path: string) => path.startsWith(`${prefix}/`);

/** First match wins, so the specific paths come before their parents. */
const ROUTES: readonly Route[] = [
  [is('/'), 'landing', LandingBody],
  [is('/login'), 'auth', LoginBody],
  [is('/register'), 'auth', RegisterBody],
  [is('/welcome'), 'onboarding', IntentBody],
  [is('/welcome/profile'), 'onboarding', ProfileSetupSkeleton],
  [is('/welcome/submitted'), 'onboarding', SubmittedBody],
  [under('/admin/profiles'), 'admin', AdminProfileBody],
  [is('/admin/media'), 'admin', AdminMediaBody],
  [is('/admin/accounts'), 'admin', AdminAccountsBody],
  [is('/admin/ratings'), 'admin', AdminRatingsBody],
  [(path) => path === '/admin' || under('/admin')(path), 'admin', AdminQueueBody],
  [(path) => path === '/directory' || path === '/creatives', 'site', DirectoryBody],
  [under('/creatives'), 'site', CreativeBody],
  [under('/offers'), 'site', OfferBody],
  [(path) => path === '/postings/new' || /^\/postings\/[^/]+\/edit$/.test(path), 'site', ComposeBody],
  [is('/postings/mine'), 'site', MyPostingsBody],
  [under('/postings'), 'site', PostingBody],
  [under('/messages'), 'site', ThreadPageBody],
  [is('/messages'), 'site', InboxPageBody],
  [under('/agreements'), 'site', AgreementBody],
  [is('/history'), 'site', HistoryBody],
  [is('/notifications'), 'site', NotificationsBody],
  [is('/account'), 'site', AccountBody],
  [is('/account/work'), 'site', WorkBody],
  [is('/account/profile'), 'site', ProfileSettingsBody],
  [is('/account/offers'), 'site', OffersSettingsBody],
  [is('/account/security'), 'site', SecurityBody],
  [(path) => path === '/privacy' || path === '/terms', 'site', LegalBody],
];

function resolve(pathname: string): { shell: Shell; Body: () => ReactNode } {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const route = ROUTES.find(([matches]) => matches(path));
  return route ? { shell: route[1], Body: route[2] } : { shell: 'bare', Body: GenericBody };
}

/**
 * The skeleton for `pathname`. `generic` draws a plain page instead, for a
 * wait that must not show the shape of what is behind it.
 */
export function PageSkeleton({
  pathname,
  scope,
  generic = false,
  notice,
}: {
  pathname: string;
  scope: FallbackScope;
  generic?: boolean;
  /** Shown above the page body: the line that says the server is waking. */
  notice?: ReactNode;
}) {
  if (generic) {
    return (
      <>
        {notice}
        <GenericBody />
      </>
    );
  }

  if (scope === 'pane') return <ThreadSkeleton />;

  const { shell, Body } = resolve(pathname);
  const body = (
    <>
      {notice}
      <Body />
    </>
  );

  if (scope === 'site') return body;

  switch (shell) {
    case 'site':
      return (
        <>
          <SiteHeader className={under('/messages')(pathname) ? 'hidden sm:block' : undefined} />
          {body}
        </>
      );
    case 'landing':
      return (
        <>
          <BrandHeaderShape />
          {body}
        </>
      );
    case 'auth':
      return <AuthShell action={<ButtonShape size="sm" />}>{body}</AuthShell>;
    case 'onboarding':
      return <OnboardingShell>{body}</OnboardingShell>;
    case 'admin':
      return <AdminShell>{body}</AdminShell>;
    case 'bare':
      return body;
  }
}

/* --- Shells --------------------------------------------------------------- */

/**
 * The landing page's navy bar, without its Sign in and Register: until the
 * session answers, nobody knows whether to offer them.
 */
function BrandHeaderShape() {
  return (
    <header className="sticky top-(--staging-banner-h) z-40 bg-primary short:static">
      <Container width="wide" className="flex h-16 items-center justify-between gap-6">
        <Wordmark tone="inverse" />
        <Skeleton className="h-11 w-20 bg-on-primary/15 pointer-fine:h-9 sm:w-52" />
      </Container>
    </header>
  );
}

function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-page bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <span className="u-display text-xl font-semibold text-ink">Bilikha</span>
        </Container>
      </header>
      <main>
        <Container width="narrow" className="py-(--section-gap)">
          {children}
        </Container>
      </main>
    </div>
  );
}

/** The admin frame, its sections as bars: their names are the admin's to see. */
function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-page bg-paper">
      <header className="border-b border-hairline">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center px-3 sm:w-56 sm:shrink-0 sm:px-4">
            <span className="u-display text-xl font-semibold text-ink sm:px-3">Bilikha</span>
          </div>
          <div className="pr-3 sm:pr-(--gutter)">
            <ButtonShape size="sm" className="w-28" />
          </div>
        </div>
      </header>
      <div className="flex gap-1 overflow-hidden border-b border-hairline px-3 py-2 sm:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0" />
        ))}
      </div>
      <div className="sm:flex sm:min-h-[calc(100dvh-4rem-var(--staging-banner-h))]">
        <aside className="hidden w-56 shrink-0 border-r border-hairline sm:block">
          <div className="p-4">
            <EyebrowLine className="px-3" />
            <div className="mt-4 space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex h-9 items-center px-3">
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </aside>
        <main className={cn('min-w-0 flex-1', pbBottomNav)}>{children}</main>
      </div>
    </div>
  );
}

/* --- Public pages --------------------------------------------------------- */

function LandingBody() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <Container width="wide" className="relative py-(--section-gap)">
          <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-24">
            <div className="max-w-2xl">
              <EyebrowLine />
              <Text
                size="3xl"
                widths={['w-full', 'w-4/5', 'w-1/2']}
                line="sm:h-15.5 md:h-18.5"
                bar="sm:h-11 md:h-14"
                className="mt-4 sm:mt-6"
              />
              <Text
                widths={['w-full', 'w-full', 'w-1/3']}
                line="sm:h-7"
                bar="sm:h-4.5"
                className="mt-4 max-w-xl sm:mt-6"
              />
              <div className="mt-6 flex flex-col gap-3 sm:mt-9 sm:flex-row">
                <Skeleton className="h-12 sm:flex-1" />
                <Skeleton className="h-12 sm:w-48" />
              </div>
              <div className="mt-6 grid max-w-xl grid-cols-3 divide-x divide-hairline sm:mt-8 lg:hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1 px-3 first:pl-0 sm:px-5">
                    <Skeleton className="h-8 w-14 sm:h-9" />
                    <Text size="sm" widths={['w-20']} />
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden rounded-lg bg-primary p-8 shadow-lg lg:block">
              <Skeleton className="h-3 w-24 bg-on-primary/15" />
              <div className="mt-5 flex flex-col divide-y divide-on-primary/20">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                    <Skeleton className="h-9 w-16 bg-on-primary/15" />
                    <Skeleton className="h-4 w-32 bg-on-primary/15" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>
      <Container width="wide" className="pb-(--section-gap)">
        <SectionHeadingShape title="w-80" action />
        <div className="mt-10">
          <DomainListSkeleton />
        </div>
      </Container>
    </main>
  );
}

function LoginBody() {
  return (
    <>
      <EyebrowLine />
      <Text size="4xl" widths={['w-40']} line="md:h-15.5" bar="md:h-11" className="mt-4" />
      <Text widths={['w-full']} className="mt-3 max-w-md" />
      <div className="mt-10 max-w-md space-y-5">
        <Field />
        <Field />
        <Skeleton className="h-12 w-full" />
        <Text size="sm" widths={['w-full', 'w-2/3']} />
      </div>
    </>
  );
}

function RegisterBody() {
  return (
    <>
      <EyebrowLine />
      <Text size="4xl" widths={['w-96']} line="md:h-15.5" bar="md:h-11" className="mt-4" />
      <Text widths={['w-full', 'w-2/3']} className="mt-3 max-w-xl" />
      <div className="mt-10 space-y-10">
        <div className="space-y-4">
          <Text size="lg" widths={['w-32']} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field />
            <Field />
            <Field />
            <Field />
          </div>
        </div>
        <div className="space-y-4">
          <Text size="lg" widths={['w-28']} />
          <Field />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field />
            <Field />
          </div>
        </div>
      </div>
    </>
  );
}

function DirectoryBody() {
  return (
    <PageMain width="wide">
      <SectionHeadingShape title="w-44" description={['w-96']} />
      <div className="mt-8 flex items-center justify-between gap-3 border-b border-hairline pb-4">
        <TabsShape className="w-52" />
        <Skeleton className="size-11 shrink-0" />
      </div>
      <div className="mt-5 flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 sm:h-10" />
        ))}
      </div>
      <ul className={cn('mt-10', offerGridClass)} aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <OfferCardSkeleton key={i} />
        ))}
      </ul>
    </PageMain>
  );
}

function CreativeBody() {
  return (
    <PageMain width="wide" className="py-6 sm:py-10">
      <ProfileSkeleton />
    </PageMain>
  );
}

function OfferBody() {
  return (
    <PageMain width="wide" className="py-6 sm:py-10">
      <OfferDetailSkeleton />
    </PageMain>
  );
}

function LegalBody() {
  return (
    <PageMain width="prose">
      <Text size="3xl" widths={['w-64']} />
      <Text widths={['w-full', 'w-1/2']} className="mt-3" />
      <Text size="sm" widths={['w-40']} className="mt-2" />
      <div className="mt-10 space-y-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Text size="xl" widths={['w-56']} />
            <Text widths={['w-full', 'w-full', 'w-3/5']} className="mt-3" />
          </div>
        ))}
      </div>
    </PageMain>
  );
}

/* --- Onboarding ----------------------------------------------------------- */

function IntentBody() {
  return (
    <>
      <PageIntroShape title="w-72" description={['w-80']} />
      <div className="mt-10 grid gap-4">
        <Skeleton className="h-23 w-full" />
        <Skeleton className="h-23 w-full" />
      </div>
    </>
  );
}

function SubmittedBody() {
  return (
    <>
      <PageIntroShape title="w-72" description={[]} />
      <Text widths={['w-full', 'w-2/3']} className="mt-4 max-w-xl" />
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonShape className="w-36" />
        <ButtonShape className="w-36" />
      </div>
    </>
  );
}

/* --- Signed in ------------------------------------------------------------ */

function AccountBody() {
  return (
    <PageMain width="default" className="py-8 sm:py-(--section-gap)">
      <PageIntroShape title="w-56" description={['w-96']} />
      <AccountSkeleton />
    </PageMain>
  );
}

function WorkBody() {
  return (
    <PageMain>
      <AccountHeadingShape width="w-72" />
      <div className="mt-10 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </PageMain>
  );
}

function ProfileSettingsBody() {
  return (
    <PageMain>
      <AccountHeadingShape width="w-28" />
      <Text widths={['w-96']} className="mt-3 max-w-xl" />
      <div className="mt-10 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
    </PageMain>
  );
}

function OffersSettingsBody() {
  return (
    <PageMain width="wide">
      <AccountHeadingShape width="w-28" />
      <ul className={cn('mt-10', offerGridClass)} aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <OfferCardSkeleton key={i} />
        ))}
      </ul>
    </PageMain>
  );
}

function SecurityBody() {
  return (
    <PageMain>
      <AccountHeadingShape width="w-32" />
      <Text widths={['w-80']} className="mt-3 max-w-xl" />
      <div className="mt-10 rounded-md border border-hairline bg-surface p-5">
        <div className="space-y-4">
          <Text size="lg" widths={['w-24']} />
          <Field />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field />
            <Field />
          </div>
          <ButtonShape className="w-40" />
        </div>
        <div className="mt-8 space-y-3 border-t border-hairline pt-6">
          <Text size="lg" widths={['w-20']} />
          <Text size="sm" widths={['w-56']} />
          <ButtonShape size="sm" />
        </div>
      </div>
    </PageMain>
  );
}

function HistoryBody() {
  return (
    <PageMain>
      <SectionHeadingShape title="w-36" />
      <TabsShape className="mt-8 w-72" />
      <div className="mt-8">
        <ListRowsSkeleton />
      </div>
    </PageMain>
  );
}

function NotificationsBody() {
  return (
    <PageMain width="default">
      <SectionHeadingShape title="w-52" />
      <NotificationRowsSkeleton />
    </PageMain>
  );
}

function MyPostingsBody() {
  return (
    <PageMain>
      <AccountHeadingShape width="w-52" />
      <Text widths={['w-80']} className="mt-3 max-w-xl" />
      <div className="mt-10">
        <PostingRowsSkeleton />
      </div>
    </PageMain>
  );
}

function ComposeBody() {
  return (
    <PageMain>
      <PageIntroShape title="w-72" description={[]} titleGap="mt-4" />
      <Skeleton className="mt-4 h-11 max-w-xl" />
      <div className="mt-8 rounded-md border border-hairline bg-surface p-5 shadow-xs sm:p-8">
        <div className="space-y-6">
          <Field />
          <Field />
          <Field />
          <Field />
          <div className="flex flex-col gap-1.5">
            <Text size="sm" widths={['w-24']} />
            <Skeleton className="h-36 w-full" />
          </div>
          <div className="grid gap-3">
            <Text size="sm" widths={['w-28']} />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-hairline pt-6 sm:flex-row sm:justify-end">
            <ButtonShape size="lg" className="w-full sm:w-28" />
            <ButtonShape size="lg" className="w-full sm:w-40" />
          </div>
        </div>
      </div>
    </PageMain>
  );
}

function PostingBody() {
  return (
    <PageMain>
      <PostingDetailSkeleton />
    </PageMain>
  );
}

function AgreementBody() {
  return (
    <PageMain>
      <AgreementSkeleton />
    </PageMain>
  );
}

/** `MessagesLayout`'s frame: the inbox, and from lg the pane beside it. */
function MessagesFrame({ inThread }: { inThread: boolean }) {
  return (
    <div className="lg:flex lg:h-[calc(100dvh-4rem-1px-var(--staging-banner-h))] lg:flex-col">
      <main className={cn(inThread ? undefined : pbBottomNav, 'lg:min-h-0 lg:flex-1')}>
        <div className="lg:mx-auto lg:grid lg:h-full lg:max-w-7xl lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-6 lg:px-(--gutter) lg:py-6">
          <section
            className={cn(
              inThread && 'max-lg:hidden',
              'lg:min-h-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface',
            )}
          >
            <Container width="narrow" className="py-(--section-gap) lg:max-w-none lg:px-0 lg:py-0">
              <div className="lg:border-b lg:border-hairline lg:px-5 lg:py-4">
                <Text size="3xl" widths={['w-40']} line="lg:h-9" bar="lg:h-6" />
                <Text size="sm" widths={['w-full', 'w-2/3']} className="mt-2 max-w-xl lg:hidden" />
              </div>
              <div className="mt-6 lg:mt-0">
                <ConversationRowsSkeleton />
              </div>
            </Container>
          </section>
          <section
            className={cn(
              !inThread && 'max-lg:hidden',
              'lg:min-h-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface',
            )}
          >
            {inThread ? (
              <ThreadSkeleton />
            ) : (
              <div className="hidden h-full flex-col items-center justify-center p-8 lg:flex">
                <Skeleton className="size-11" />
                <Skeleton className="mt-4 h-6 w-48" />
                <Skeleton className="mt-2 h-4 w-64" />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function InboxPageBody() {
  return <MessagesFrame inThread={false} />;
}

function ThreadPageBody() {
  return <MessagesFrame inThread />;
}

/* --- Admin ---------------------------------------------------------------- */

function AdminPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Container width="wide" className="py-(--section-gap)">
      <PageIntroShape title={title} description={['w-full', 'w-2/3']} />
      {children}
    </Container>
  );
}

function AdminQueueBody() {
  return (
    <AdminPage title="w-56">
      <div className="mt-8 flex flex-wrap gap-2 border-b border-hairline pb-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex h-9 items-center px-3">
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </AdminPage>
  );
}

function AdminMediaBody() {
  return (
    <AdminPage title="w-52">
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    </AdminPage>
  );
}

function AdminAccountsBody() {
  return (
    <AdminPage title="w-40">
      <div className="mt-8 flex flex-wrap items-end gap-3">
        <Field className="min-w-56 flex-1" />
        <ButtonShape className="w-24" />
      </div>
    </AdminPage>
  );
}

function AdminRatingsBody() {
  return (
    <AdminPage title="w-64">
      <div className="mt-10 space-y-4">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </AdminPage>
  );
}

function AdminProfileBody() {
  return (
    <Container width="narrow" className="py-(--section-gap)">
      <ButtonShape size="sm" className="-ml-2 w-40" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    </Container>
  );
}

/* --- Anything else -------------------------------------------------------- */

function GenericBody() {
  return (
    <PageMain>
      <PageIntroShape />
      <Skeleton className="mt-10 h-48 w-full" />
    </PageMain>
  );
}
