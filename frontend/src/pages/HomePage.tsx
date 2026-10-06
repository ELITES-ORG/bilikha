import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Palette, Search, TriangleAlert, Users } from 'lucide-react';
import { CornerBlob, CornerWave, SoftBlob } from '@/components/Decor';
import { SiteHeader } from '@/components/SiteHeader';
import { Wordmark } from '@/components/Wordmark';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Eyebrow,
  Input,
  SectionHeading,
  Skeleton,
  StatItem,
} from '@/components/ui';
import { pbBottomNav } from '@/lib/bottom-nav';

export function HomePage() {
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();

  return (
    <>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>

      <SiteHeader tone="brand" />
      <RegistrationStatusBanner />

      <main id="main" className={pbBottomNav}>
        <Hero />

        <Container width="wide" className="pb-(--section-gap)">
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
                {domains.data.map((domain, index) => (
                  <li
                    key={domain.id}
                    className="anim-rise-in border-b border-hairline"
                    style={{ '--i': index } as CSSProperties}
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

        <section className="border-t border-hairline bg-surface-sunken py-(--section-gap)">
          <Container width="wide">
            <SectionHeading
              as="h3"
              eyebrow="Coverage"
              title="Eight municipalities"
              description="Filter the registry by where a creative actually works."
            />

            <div className="mt-8 flex flex-wrap gap-2">
              {municipalities.isPending &&
                Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} radius="full" className="h-8 w-24" />
                ))}

              {municipalities.data?.map((municipality, index) => (
                <Link
                  key={municipality.id}
                  to={`/directory?municipality=${municipality.slug}`}
                  className="anim-scale-in interactive-press inline-flex items-center gap-1.5 min-h-11 rounded-full border border-hairline-strong bg-surface px-4 py-2 text-sm text-ink-muted shadow-xs transition-colors hover:border-lawa-300 hover:bg-lawa-50 hover:text-lawa-800"
                  style={{ '--i': index } as CSSProperties}
                >
                  <MapPin className="size-3.5 text-palayok-500" aria-hidden="true" />
                  {municipality.name}
                </Link>
              ))}
            </div>
          </Container>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Depth behind the headline, and the navy-and-red wave on the bottom
          corner. Both decorative and pinned to edges, so neither sits under
          text a reader needs. */}
      <SoftBlob className="-top-24 -right-32 size-[28rem] opacity-80 lg:-right-16 lg:size-[36rem]" />
      <CornerWave className="hidden lg:block" />

      <Container width="wide" className="relative py-(--section-gap)">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-24">
        <div className="max-w-2xl">
          <Eyebrow className="anim-fade-in">Biliran Creative Industries Registry</Eyebrow>

          <h1
            className="u-serif anim-rise-in mt-6 text-5xl text-ink md:text-6xl"
            style={{ '--i': 1 } as CSSProperties}
          >
            Every creative in <em className="text-palayok-500">Biliran</em>, in one place.
          </h1>

          <p
            className="anim-rise-in mt-6 max-w-xl text-lg text-ink-muted"
            style={{ '--i': 2 } as CSSProperties}
          >
            Filmmakers, weavers, musicians, designers, festival organisers. Find the people
            already doing the work here — and let them find you.
          </p>

          <form
            className="anim-rise-in mt-9 flex flex-col gap-3 sm:flex-row"
            style={{ '--i': 3 } as CSSProperties}
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="sm:flex-1">
              <Input
                className="h-12 shadow-sm"
                placeholder="Search by craft, name, or town"
                aria-label="Search the registry"
                iconLeft={<Search className="size-5" />}
                trailing={
                  // Phone only: the inline submit the reference shows. From
                  // `sm` the full button sits beside the field instead.
                  <Button
                    type="submit"
                    variant="accent"
                    size="sm"
                    aria-label="Search"
                    className="size-11 px-0 sm:hidden"
                  >
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </Button>
                }
              />
            </div>
            <Button type="submit" size="lg" fullWidth className="sm:w-auto">
              Search the registry
            </Button>
          </form>

          {/* Phone and tablet: a row under the search. From `lg` the same
              figures move into the panel beside the headline. */}
          <div
            className="anim-rise-in mt-12 grid max-w-xl grid-cols-3 divide-x divide-hairline lg:hidden"
            style={{ '--i': 4 } as CSSProperties}
          >
            <StatItem
              value="9"
              label="Creative domains"
              icon={<Palette className="size-5 text-palayok-500" />}
            />
            <StatItem
              value="81"
              label="Sub-domains"
              icon={<Users className="size-5 text-lawa-600" />}
            />
            <StatItem
              value="8"
              label="Municipalities"
              icon={<MapPin className="size-5 text-palayok-500" />}
            />
          </div>
        </div>

        <aside
          aria-label="The registry at a glance"
          className="anim-rise-in relative hidden overflow-hidden rounded-xl bg-primary p-8 shadow-lg lg:block"
          style={{ '--i': 3 } as CSSProperties}
        >
          <CornerBlob placement="top-right" onNavy className="opacity-80" />
          <p className="u-eyebrow relative text-on-primary-muted">At a glance</p>
          <div className="relative mt-6 flex flex-col divide-y divide-lawa-500">
            <StatItem
              tone="inverse"
              className="px-0 py-5 first:pt-0 last:pb-0 sm:px-0"
              value="9"
              label="Creative domains"
              icon={<Palette className="size-6 text-palayok-400" />}
            />
            <StatItem
              tone="inverse"
              className="px-0 py-5 first:pt-0 last:pb-0 sm:px-0"
              value="81"
              label="Sub-domains"
              icon={<Users className="size-6 text-lawa-200" />}
            />
            <StatItem
              tone="inverse"
              className="px-0 py-5 first:pt-0 last:pb-0 sm:px-0"
              value="8"
              label="Municipalities"
              icon={<MapPin className="size-6 text-palayok-400" />}
            />
          </div>
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
          className="flex items-center gap-8 border-b border-hairline py-6"
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

function SiteFooter() {
  return (
    <footer className="border-t border-hairline py-12">
      <Container width="wide" className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-1 max-w-sm text-sm text-ink-subtle">
            A registry of creative work in the province of Biliran.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="flex gap-4 text-sm">
            <Link to="/privacy" className="link-underline text-ink-muted">
              Privacy notice
            </Link>
            <Link to="/terms" className="link-underline text-ink-muted">
              Terms of use
            </Link>
          </p>
          <p className="text-xs text-ink-subtle">
            Creative domains follow RA 11904
          </p>
        </div>
      </Container>
    </footer>
  );
}
