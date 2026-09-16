import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Search, TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  SectionHeading,
  Skeleton,
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

      <SiteHeader />
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
                      to={`/domains/${domain.slug}`}
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
                          <span className="text-clay-400">
                            {' '}
                            +{domain.subdomains.length - 3} more
                          </span>
                        )}
                      </p>

                      <span className="col-start-2 mt-3 flex items-center gap-3 md:col-start-4 md:mt-0">
                        <Badge tone="neutral">{domain.subdomains.length}</Badge>
                        <ArrowUpRight className="size-4 text-clay-400 transition-[transform,color] duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-lawa-700" />
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
                  to={`/municipalities/${municipality.slug}`}
                  className="anim-scale-in interactive-press inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-surface px-3.5 py-1.5 text-sm text-ink-muted shadow-xs transition-colors hover:border-lawa-300 hover:bg-lawa-50 hover:text-lawa-800"
                  style={{ '--i': index } as CSSProperties}
                >
                  <MapPin className="size-3.5 text-clay-400" aria-hidden="true" />
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
      {/* A single soft wash anchored off-centre. One light source, no gradient
          text, nothing that announces itself as decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-56 size-[36rem] rounded-full opacity-[0.55] blur-3xl"
        style={{
          background:
            'radial-gradient(circle, var(--color-lawa-100) 0%, transparent 68%)',
        }}
      />

      <Container width="wide" className="relative py-(--section-gap)">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-20">
          <div className="max-w-2xl">
            <p className="u-eyebrow anim-fade-in flex items-center gap-2">
              <span className="inline-block h-px w-6 bg-palayok-500" aria-hidden="true" />
              Biliran Creative Industries Registry
            </p>

            <h1
              className="u-display anim-rise-in mt-5 text-4xl text-ink md:text-5xl"
              style={{ '--i': 1 } as CSSProperties}
            >
              Every creative in Biliran, in one place.
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
              <Input
                className="sm:w-80"
                placeholder="Search by craft, name, or town"
                aria-label="Search the registry"
                iconLeft={<Search className="size-4" />}
              />
              <Button type="submit" size="md">
                Search the registry
              </Button>
            </form>
          </div>

          {/* Deliberately ragged: the stat column sits lower than the headline
              rather than aligning to a tidy centred grid. */}
          <aside className="flex gap-10 lg:flex-col lg:gap-8 lg:pt-32">
            <Stat value="9" label="Creative domains" />
            <Stat value="81" label="Sub-domains" />
            <Stat value="8" label="Municipalities" />
          </aside>
        </div>
      </Container>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-l-2 border-palayok-200 pl-4">
      <p className="u-display text-3xl text-ink tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm text-ink-subtle">{label}</p>
    </div>
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
          <p className="u-display text-lg text-ink">Bilikha</p>
          <p className="mt-1 max-w-sm text-sm text-ink-subtle">
            A registry of creative work in the province of Biliran.
          </p>
        </div>
        <p className="text-xs text-clay-400">
          Creative domains follow RA 11904
        </p>
      </Container>
    </footer>
  );
}
