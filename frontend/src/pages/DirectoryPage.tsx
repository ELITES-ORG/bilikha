import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Container,
  EmptyState,
  SectionHeading,
  Skeleton,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { usePublishedProfiles } from '@/features/profiles/api';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
  const domain = params.get('domain') ?? undefined;
  const subdomain = params.get('subdomain') ?? undefined;
  const municipality = params.get('municipality') ?? undefined;
  const page = Number(params.get('page') ?? '1') || 1;

  const { data: user } = useCurrentUser();
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();
  const list = usePublishedProfiles({ domain, subdomain, municipality, page, limit: 20 });

  const selectedDomain = useMemo(
    () => domains.data?.find((d) => d.slug === domain),
    [domains.data, domain],
  );

  const nearbyMunicipalityName = user?.municipalityName ?? null;

  function setFilter(next: Record<string, string | undefined>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (!value) merged.delete(key);
      else merged.set(key, value);
    }
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  }

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit)) : 1;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main>
        <Container width="wide" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Find a creative"
            title="Directory"
            description="Browse published creatives by domain, sub-domain, or municipality. Nothing here requires an account."
          />

          <div className="mt-8 grid gap-4 border-b border-hairline pb-8 md:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Domain
              <select
                className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base"
                value={domain ?? ''}
                onChange={(e) =>
                  setFilter({
                    domain: e.target.value || undefined,
                    subdomain: undefined,
                  })
                }
              >
                <option value="">All domains</option>
                {domains.data?.map((d) => (
                  <option key={d.id} value={d.slug}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Sub-domain
              <select
                className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base"
                value={subdomain ?? ''}
                disabled={!selectedDomain}
                onChange={(e) => setFilter({ subdomain: e.target.value || undefined })}
              >
                <option value="">All sub-domains</option>
                {selectedDomain?.subdomains.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Municipality
              <select
                className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base"
                value={municipality ?? ''}
                onChange={(e) => setFilter({ municipality: e.target.value || undefined })}
              >
                <option value="">All municipalities</option>
                {municipalities.data?.map((m) => (
                  <option key={m.id} value={m.slug}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-10">
            {nearbyMunicipalityName && !municipality && (
              <p className="mb-6 text-sm text-ink-muted">
                Showing creatives in {nearbyMunicipalityName} first
              </p>
            )}

            {list.isPending && (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            )}

            {list.isError && (
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load the directory"
                description={list.error.message}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {list.data && list.data.data.length === 0 && (
              <EmptyState
                title="Nobody listed here yet"
                description={
                  subdomain
                    ? 'This sub-domain has no published creatives. Try the parent domain, or clear the filters and browse everyone.'
                    : domain
                      ? 'This domain has no published creatives yet. Clear the filter to see the full directory.'
                      : municipality
                        ? 'No published creatives in that municipality yet. Clear the filter to browse the province.'
                        : 'Published creatives will appear here as the registry grows.'
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {subdomain && domain && (
                      <Button size="sm" variant="secondary" onClick={() => setFilter({ subdomain: undefined })}>
                        Browse {selectedDomain?.name ?? 'domain'}
                      </Button>
                    )}
                    {(domain || subdomain || municipality) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setFilter({ domain: undefined, subdomain: undefined, municipality: undefined })}
                      >
                        Clear filters
                      </Button>
                    )}
                    <ButtonLink to="/" size="sm" variant="ghost">
                      Back home
                    </ButtonLink>
                  </div>
                }
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {list.data.data.map((profile) => {
                  const primary = profile.subdomains.find((s) => s.isPrimary);
                  const others = profile.subdomains.filter((s) => !s.isPrimary);
                  return (
                    <li key={profile.slug}>
                      <Link
                        to={`/creatives/${profile.slug}`}
                        className="group flex flex-col gap-2 py-6 transition-colors hover:bg-clay-50/60 sm:flex-row sm:items-start sm:justify-between sm:gap-8"
                      >
                        <div className="flex gap-4">
                          <Avatar
                            src={profile.avatarUrl}
                            name={profile.displayName ?? profile.fullName}
                            size="md"
                            className="mt-0.5"
                          />
                          <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="u-display text-xl text-ink group-hover:text-lawa-700">
                              {profile.displayName ?? profile.fullName}
                            </h2>
                            {profile.isNearby && <Badge tone="accent">Nearby</Badge>}
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                            <MapPin className="size-3.5" aria-hidden />
                            {profile.municipality}
                          </p>
                          {profile.bio && (
                            <p className="mt-2 line-clamp-2 max-w-prose text-sm text-ink-muted text-pretty">
                              {profile.bio}
                            </p>
                          )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {primary && <Badge tone="brand">{primary.name}</Badge>}
                          {others.map((s) => (
                            <Badge key={s.slug} tone="neutral">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {list.data && totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-4">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setFilter({ page: String(page - 1) })}
                >
                  Previous
                </Button>
                <p className="text-sm text-ink-muted tabular-nums">
                  Page {page} of {totalPages}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setFilter({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
