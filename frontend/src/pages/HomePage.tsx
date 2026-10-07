import { lazy, Suspense, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Blocks, MapPin, Palette, Search, TriangleAlert, type LucideIcon } from 'lucide-react';
import elitesWordmark from '@/assets/elites-wordmark.webp';
import type { AnimatedStatIconName } from '@/components/animated-icons/AnimatedStatIcon';
import { CornerBlob, CornerWave } from '@/components/Decor';
import { transitionTo, type PageTransitionKind } from '@/components/page-transition/transition-to';
import { SiteHeader } from '@/components/SiteHeader';
import { Wordmark } from '@/components/Wordmark';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import {
  Badge,
  Button,
  ButtonLink,
  Container,
  EmptyState,
  Eyebrow,
  Input,
  SectionHeading,
  Skeleton,
  StatItem,
} from '@/components/ui';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';
import { LEGAL_CONTACT, LEGAL_OPERATOR } from '@/lib/legal';
import { useRevealOnScroll } from '@/lib/use-reveal-on-scroll';

const AnimatedStatIcon = lazy(() => import('@/components/animated-icons/AnimatedStatIcon'));
const BiliranMap = lazy(() => import('@/components/biliran-map/BiliranMap'));

export function HomePage() {
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();
  const mainRef = useRef<HTMLElement>(null);
  useRevealOnScroll(mainRef);

  return (
    <>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>

      <SiteHeader tone="brand" />
      <RegistrationStatusBanner />

      <main id="main" ref={mainRef}>
        <Hero />

        <Container id="domains" width="wide" className="pb-(--section-gap)">
          <div data-reveal className="anim-rise-in">
            <SectionHeading
              eyebrow="The taxonomy"
              title="Nine creative domains"
              description="Every registered creative in Biliran is listed under one or more of these, following the domain set defined by RA 11904."
              action={
                <Button variant="secondary" size="sm" iconRight={<ArrowUpRight className="size-4" />}>
                  How registration works
                </Button>
              }
            />
          </div>

          <div className="mt-10">
            {domains.isPending && <DomainListSkeleton />}

            {domains.isError && (
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load the domains"
                description={domains.error.message}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void domains.refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {domains.data && (
              <ol className="border-t border-hairline">
                {domains.data.map((domain) => (
                  <li
                    key={domain.id}
                    data-reveal="stagger"
                    className="anim-rise-in border-b border-hairline last:border-b-0"
                  >
                    <Link
                      to={`/directory?domain=${domain.slug}`}
                      className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 py-6 md:grid-cols-[3.5rem_minmax(0,18rem)_1fr_auto] md:gap-x-8"
                    >
                      {/* Oldstyle numerals in the display face read as an index,
                          not a list of feature cards. */}
                      <span
                        className="u-display text-2xl text-palayok-600/80 tabular-nums md:text-3xl"
                        aria-hidden="true"
                      >
                        {String(domain.displayOrder).padStart(2, '0')}
                      </span>

                      <h3 className="u-display text-xl text-ink transition-colors group-hover:text-lawa-700 md:text-2xl">
                        {domain.name}
                      </h3>

                      <p className="col-start-2 mt-2 text-sm text-ink-subtle md:col-start-3 md:mt-0 md:text-base">
                        {domain.subdomains
                          .slice(0, 3)
                          .map((sub) => sub.name)
                          .join(' · ')}
                        {domain.subdomains.length > 3 && (
                          <span className="text-ink-subtle">
                            {' '}
                            +{domain.subdomains.length - 3} more
                          </span>
                        )}
                      </p>

                      <span className="col-start-2 mt-3 flex items-center gap-3 md:col-start-4 md:mt-0">
                        <Badge tone="neutral">{domain.subdomains.length}</Badge>
                        <ArrowUpRight className="size-4 text-ink-subtle transition-[transform,color] duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-lawa-700" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Container>

        <section
          id="coverage"
          className="border-y border-hairline bg-surface-sunken py-(--section-gap)"
        >
          <Container width="wide">
            {/* From lg the heading and the towns share a column beside the map,
                centred against it, so neither side is left mostly empty. */}
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_28rem] xl:gap-20">
              <div>
                <div data-reveal className="anim-rise-in">
                  <SectionHeading
                    eyebrow="Coverage"
                    title={
                      municipalities.data
                        ? `${countInWords(municipalities.data.length)} municipalities`
                        : 'Municipalities'
                    }
                    description="Filter the registry by where a creative actually works."
                  />
                </div>

                {/* An even grid, never a ragged wrap: two across where a cell
                    would be too narrow for "Cabucgayan", four where it is not. */}
                <div
                  data-reveal
                  className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"
                >
                  {municipalities.isPending &&
                    Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}

                  {municipalities.data?.map((municipality, index) => (
                    <Link
                      key={municipality.id}
                      to={`/directory?municipality=${municipality.slug}`}
                      className="group anim-scale-in interactive-press inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-hairline-strong bg-surface px-4 text-sm text-ink-muted shadow-xs hover:border-lawa-300 hover:bg-lawa-50 hover:text-lawa-800"
                      style={{ '--i': index } as CSSProperties}
                    >
                      <MapPin
                        className="size-3.5 shrink-0 text-ink-subtle transition-colors group-hover:text-lawa-700"
                        aria-hidden="true"
                      />
                      <span className="truncate">{municipality.name}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {municipalities.data && (
                <Suspense fallback={null}>
                  <BiliranMap
                    municipalities={municipalities.data}
                    className="mx-auto w-full max-w-sm lg:max-w-none"
                  />
                </Suspense>
              )}
            </div>
          </Container>
        </section>

        <JoinCallout />
      </main>

      <SiteFooter />
    </>
  );
}

interface HeroStat {
  label: string;
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  animatedIcon: AnimatedStatIconName;
  count: number | undefined;
  isPending: boolean;
}

/** Counted from the cached taxonomy, so the figures cannot drift from it. */
function useHeroStats(): HeroStat[] {
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();
  return [
    {
      label: 'Creative domains',
      shortLabel: 'Domains',
      href: '#domains',
      icon: Palette,
      animatedIcon: 'palette',
      count: domains.data?.length,
      isPending: domains.isPending,
    },
    {
      label: 'Crafts and specialisations',
      shortLabel: 'Crafts',
      href: '#domains',
      icon: Blocks,
      animatedIcon: 'blocks',
      count: domains.data?.reduce((total, domain) => total + domain.subdomains.length, 0),
      isPending: domains.isPending,
    },
    {
      label: 'Municipalities',
      shortLabel: 'Towns',
      href: '#coverage',
      icon: MapPin,
      animatedIcon: 'map-pin',
      count: municipalities.data?.length,
      isPending: municipalities.isPending,
    },
  ];
}

function statIcon(stat: HeroStat, index: number, className: string): ReactNode {
  return (
    <Suspense fallback={<stat.icon className={className} />}>
      <AnimatedStatIcon name={stat.animatedIcon} index={index} className={className} />
    </Suspense>
  );
}

const COUNT_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

/** A heading reads "Eight municipalities"; past twelve, a numeral reads better than the word. */
function countInWords(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function statFigure(stat: HeroStat, onNavy = false): ReactNode {
  if (stat.isPending) {
    return (
      <Skeleton
        className={cn('inline-block h-8 w-10 align-middle', onNavy && 'bg-on-primary/15')}
      />
    );
  }
  return stat.count ?? '—';
}

function Hero() {
  const stats = useHeroStats();

  return (
    <section className="relative overflow-hidden">
      {/* The navy-and-red wave on the bottom corner. Decorative and pinned to
          the edge, so it never sits under text a reader needs. */}
      <CornerWave className="hidden lg:block" />

      <Container width="wide" className="relative py-(--section-gap)">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-24">
          <div className="max-w-2xl">
            <Eyebrow className="anim-fade-in">Biliran Creative Industries Registry</Eyebrow>

            {/* Tighter on a phone, where the search and the figures must
                clear the fold. */}
            <h1
              className="u-serif anim-rise-in mt-4 text-3xl text-ink sm:mt-6 sm:text-5xl md:text-6xl"
              style={{ '--i': 1 } as CSSProperties}
            >
              Every creative in <em className="text-palayok-500">Biliran</em>, in one place.
            </h1>

            <p
              className="anim-rise-in mt-4 max-w-xl text-md text-ink-muted sm:mt-6 sm:text-lg"
              style={{ '--i': 2 } as CSSProperties}
            >
              Filmmakers, weavers, musicians, designers, festival organisers.{' '}
              Find the people already doing the work here — and let them find you.
            </p>

            <form
              className="anim-rise-in mt-6 flex flex-col gap-3 sm:mt-9 sm:flex-row"
              style={{ '--i': 3 } as CSSProperties}
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="sm:flex-1">
                <Input
                  type="search"
                  enterKeyHint="search"
                  className="h-12 shadow-sm"
                  placeholder="Search by craft, name, or town"
                  aria-label="Search the registry"
                  iconLeft={<Search className="size-5" />}
                />
              </div>
              <Button type="submit" size="lg" fullWidth className="sm:w-auto">
                Search the registry
              </Button>
            </form>

            {/* Phone and tablet: a row under the search. From `lg` the same
                figures move into the panel beside the headline. */}
            <dl
              data-reveal
              className="anim-rise-in mt-6 grid max-w-xl grid-cols-3 divide-x divide-hairline sm:mt-8 lg:hidden"
              style={{ '--i': 4 } as CSSProperties}
            >
              {stats.map((stat, index) => (
                <StatItem
                  key={stat.label}
                  href={stat.href}
                  value={statFigure(stat)}
                  label={stat.label}
                  shortLabel={stat.shortLabel}
                  icon={statIcon(stat, index, 'size-5 text-lawa-600')}
                />
              ))}
            </dl>
          </div>

          <aside
            aria-label="The registry at a glance"
            className="anim-rise-in relative hidden overflow-hidden rounded-lg bg-primary p-8 shadow-lg lg:block"
            style={{ '--i': 3 } as CSSProperties}
          >
            <CornerBlob placement="top-right" onNavy className="opacity-80 lg:size-40" />
            <p className="u-eyebrow relative text-on-primary-muted">At a glance</p>
            <dl className="relative mt-5 flex flex-col divide-y divide-on-primary/20">
              {stats.map((stat, index) => (
                <StatItem
                  key={stat.label}
                  tone="inverse"
                  href={stat.href}
                  className="px-0 py-4 first:pt-0 last:pb-0 sm:px-0"
                  value={statFigure(stat, true)}
                  label={stat.label}
                  icon={statIcon(stat, index, 'size-6 text-on-primary-muted')}
                />
              ))}
            </dl>
          </aside>
        </div>
      </Container>
    </section>
  );
}

function DomainListSkeleton() {
  return (
    <div className="border-t border-hairline">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-8 border-b border-hairline py-6 last:border-b-0"
          style={{ opacity: 1 - index * 0.14 }}
        >
          <Skeleton className="h-7 w-10 shrink-0" />
          <Skeleton className="h-6 w-52 shrink-0" />
          <Skeleton className="hidden h-4 flex-1 md:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * The page's last step for a creative who has read this far. Anyone signed in
 * already has an account, so it stays away for them — and while the session is
 * still being checked, rather than flashing in and out.
 */
function JoinCallout() {
  const { data: user, isPending } = useCurrentUser();
  if (isPending || user) return null;

  return (
    <section aria-labelledby="join-title" className="py-(--section-gap)">
      <Container width="wide">
        <div
          data-reveal
          className="anim-rise-in relative overflow-hidden rounded-lg bg-primary px-6 py-10 shadow-lg sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10"
        >
          <CornerBlob placement="top-right" onNavy className="opacity-80" />
          <div className="relative max-w-xl">
            <h2 id="join-title" className="u-display text-3xl text-on-primary">
              Are you a creative in Biliran?
            </h2>
            <p className="mt-3 text-on-primary-muted">
              Get listed in the registry, so the people looking for your craft can find you.
            </p>
          </div>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <ButtonLink to="/register" variant="accent" size="lg" onClick={transitionTo('bloom')}>
              Get listed
            </ButtonLink>
            <ButtonLink to="/directory" variant="inverse" size="lg" onClick={transitionTo('wave')}>
              Browse the directory
            </ButtonLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

const RA_11904_URL = 'https://lawphil.net/statutes/repacts/ra2022/ra_11904_2022.html';

const externalLink = { target: '_blank', rel: 'noopener noreferrer' } as const;

function SiteFooter() {
  const { data: user } = useCurrentUser();
  // Register and Sign in bloom, as they do from the header: the same
  // destination arrives the same way wherever it is tapped.
  const links: { to: string; label: string; kind: PageTransitionKind }[] = [
    { to: '/directory', label: 'Directory', kind: 'wave' },
    ...(user
      ? []
      : [
          { to: '/register', label: 'Register', kind: 'bloom' as const },
          { to: '/login', label: 'Sign in', kind: 'bloom' as const },
        ]),
    { to: '/privacy', label: 'Privacy notice', kind: 'wave' },
    { to: '/terms', label: 'Terms of use', kind: 'wave' },
  ];

  return (
    // The tab-bar clearance sits here, at the very end of the page: on `main`
    // it opened a gap above the footer and still let the bar cover its last line.
    // Only signed-in visitors have the bar, so only they get the clearance.
    <footer className={cn('border-t border-hairline pt-12', user && pbBottomNav)}>
      <Container width="wide" className="pb-8 sm:pb-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <Wordmark />
            <p className="mt-1 max-w-sm text-sm text-ink-subtle">
              A registry of creative work in the province of Biliran.
            </p>
            {LEGAL_CONTACT && (
              <p className="mt-3 text-sm text-ink-subtle">
                Write to{' '}
                <a href={`mailto:${LEGAL_CONTACT}`} className="u-tap link-underline text-ink-muted">
                  {LEGAL_CONTACT}
                </a>
              </p>
            )}
          </div>

          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
              {links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={transitionTo(link.kind)}
                    className="u-tap link-underline text-ink-muted hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-hairline pt-6 text-xs text-ink-subtle sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-ink-muted">
              © {new Date().getFullYear()} {LEGAL_OPERATOR}
            </p>
            <p>
              <span className="block sm:inline">
                Creative domains follow{' '}
                <a href={RA_11904_URL} {...externalLink} className="u-tap link-underline">
                  RA 11904
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                {' · '}
              </span>
              {/* The ODbL requires this wherever the map's coastline is shown. */}
              <span className="mt-1 block sm:mt-0 sm:inline">
                Map data ©{' '}
                <a href="https://www.openstreetmap.org/copyright" {...externalLink} className="u-tap link-underline">
                  OpenStreetMap contributors
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </span>
            </p>
          </div>
          <p className="flex items-center gap-1.5">
            Developed and maintained by
            <a
              href="https://elitesys.org"
              {...externalLink}
              className="u-tap inline-flex transition-opacity hover:opacity-80"
            >
              <img
                src={elitesWordmark}
                alt="Elites"
                width={229}
                height={48}
                className="h-4 w-auto"
                draggable={false}
              />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
