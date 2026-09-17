import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListFilter, MapPin, TriangleAlert, X } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Avatar,
  Badge,
  Button,
  Container,
  EmptyState,
  SectionHeading,
  Skeleton,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { usePublishedOffers } from '@/features/offers/api';
import { usePublishedProfiles } from '@/features/profiles/api';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { formatPriceRange } from '@/lib/money';
import { cn } from '@/lib/cn';

type DirectoryView = 'offers' | 'creatives';

function parseBudget(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function parseView(raw: string | null): DirectoryView {
  return raw === 'creatives' ? 'creatives' : 'offers';
}

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
  const view = parseView(params.get('view'));
  const domain = params.get('domain') ?? undefined;
  const subdomain = params.get('subdomain') ?? undefined;
  const municipality = params.get('municipality') ?? undefined;
  const budgetMin = parseBudget(params.get('budgetMin'));
  const budgetMax = parseBudget(params.get('budgetMax'));
  const page = Number(params.get('page') ?? '1') || 1;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [draftBudgetMin, setDraftBudgetMin] = useState(budgetMin?.toString() ?? '');
  const [draftBudgetMax, setDraftBudgetMax] = useState(budgetMax?.toString() ?? '');

  const { data: user } = useCurrentUser();
  const domains = useCreativeDomains();
  const municipalities = useMunicipalities();
  const offers = usePublishedOffers(
    {
      domain,
      subdomain,
      municipality,
      budgetMin,
      budgetMax,
      page,
      limit: 20,
    },
    view === 'offers',
  );
  const creatives = usePublishedProfiles(
    {
      domain,
      subdomain,
      municipality,
      page,
      limit: 20,
    },
    view === 'creatives',
  );

  const list = view === 'offers' ? offers : creatives;

  const selectedDomain = useMemo(
    () => domains.data?.find((d) => d.slug === domain),
    [domains.data, domain],
  );

  const nearbyMunicipalityName = user?.municipalityName ?? null;

  const activeFilterCount = (
    view === 'offers'
      ? [domain, subdomain, municipality, budgetMin, budgetMax]
      : [domain, subdomain, municipality]
  ).filter((v) => v != null && v !== '').length;

  function openFilters() {
    setDraftBudgetMin(budgetMin?.toString() ?? '');
    setDraftBudgetMax(budgetMax?.toString() ?? '');
    setFiltersOpen(true);
  }

  useEffect(() => {
    if (!filtersOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFiltersOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [filtersOpen]);

  function setFilter(next: Record<string, string | undefined>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (!value) merged.delete(key);
      else merged.set(key, value);
    }
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  }

  function setView(next: DirectoryView) {
    const merged = new URLSearchParams(params);
    if (next === 'offers') merged.delete('view');
    else merged.set('view', next);
    merged.delete('page');
    // Budget only applies to offers.
    if (next === 'creatives') {
      merged.delete('budgetMin');
      merged.delete('budgetMax');
    }
    setParams(merged, { replace: true });
  }

  function applyBudget() {
    const min = parseBudget(draftBudgetMin.trim() || null);
    const max = parseBudget(draftBudgetMax.trim() || null);
    if (min != null && max != null && min > max) return;
    setFilter({
      budgetMin: min != null ? String(min) : undefined,
      budgetMax: max != null ? String(max) : undefined,
    });
  }

  function clearFilters() {
    setDraftBudgetMin('');
    setDraftBudgetMax('');
    setFilter({
      domain: undefined,
      subdomain: undefined,
      municipality: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
    });
  }

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;
  const budgetInvalid =
    draftBudgetMin !== ''
    && draftBudgetMax !== ''
    && parseBudget(draftBudgetMin) != null
    && parseBudget(draftBudgetMax) != null
    && (parseBudget(draftBudgetMin) as number) > (parseBudget(draftBudgetMax) as number);

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="wide" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Find work or people"
            title="Directory"
            description="Browse published offers and creatives. Nothing here requires an account."
          />

          <div
            role="tablist"
            aria-label="Directory sections"
            className="mt-8 flex gap-6 border-b border-hairline"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'offers'}
              className={cn(
                'border-b-2 pb-2 text-sm font-medium transition-colors',
                view === 'offers'
                  ? 'border-lawa-700 text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              onClick={() => setView('offers')}
            >
              Offers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'creatives'}
              className={cn(
                'border-b-2 pb-2 text-sm font-medium transition-colors',
                view === 'creatives'
                  ? 'border-lawa-700 text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              onClick={() => setView('creatives')}
            >
              Creatives
            </button>
          </div>

          <div className="relative mt-6 border-b border-hairline pb-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-expanded={filtersOpen}
                aria-controls="directory-filters"
                onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())}
              >
                <ListFilter className="size-4" aria-hidden />
                Quick filters
                {activeFilterCount > 0 && (
                  <Badge tone="accent" className="tabular-nums">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="text-sm text-ink-muted hover:text-ink"
                  onClick={clearFilters}
                >
                  Clear all
                </button>
              )}
            </div>

            {filtersOpen && (
              <div
                id="directory-filters"
                ref={panelRef}
                role="dialog"
                aria-label="Quick filters"
                className={cn(
                  'absolute inset-x-0 top-full z-20 mt-2 rounded-md border border-hairline bg-surface p-4 shadow-md',
                  'md:left-0 md:right-auto md:w-full md:max-w-lg',
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">Filters</p>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-sm text-ink-muted hover:bg-clay-100 hover:text-ink"
                    aria-label="Close filters"
                    onClick={() => setFiltersOpen(false)}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="grid gap-4">
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

                  {view === 'offers' && (
                    <fieldset className="grid gap-3">
                      <legend className="text-sm font-medium text-ink">Budget (₱)</legend>
                      <p className="text-xs text-ink-muted">
                        Optional. Leave blank for any price, including price on request.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5 text-sm text-ink">
                          Min
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            placeholder="Any"
                            value={draftBudgetMin}
                            onChange={(e) => setDraftBudgetMin(e.target.value)}
                            onBlur={applyBudget}
                            className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base tabular-nums"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm text-ink">
                          Max
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            placeholder="Any"
                            value={draftBudgetMax}
                            onChange={(e) => setDraftBudgetMax(e.target.value)}
                            onBlur={applyBudget}
                            className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base tabular-nums"
                          />
                        </label>
                      </div>
                      {budgetInvalid && (
                        <p className="text-xs text-danger-700">
                          Maximum must be at least the minimum.
                        </p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={budgetInvalid}
                        onClick={() => {
                          applyBudget();
                          setFiltersOpen(false);
                        }}
                      >
                        Apply budget
                      </Button>
                    </fieldset>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-10">
            {nearbyMunicipalityName && !municipality && (
              <p className="mb-6 text-sm text-ink-muted">
                {view === 'offers'
                  ? `Showing offers from creatives in ${nearbyMunicipalityName} first`
                  : `Showing creatives in ${nearbyMunicipalityName} first`}
              </p>
            )}

            {list.isPending && (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            )}

            {list.isError && (
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title={view === 'offers' ? 'Could not load offers' : 'Could not load creatives'}
                description={list.error.message}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {view === 'offers' && offers.data && offers.data.data.length === 0 && (
              <EmptyState
                title="No offers here yet"
                description="Try another filter, or browse creatives instead."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={() => setView('creatives')}>
                      Browse creatives
                    </Button>
                    {activeFilterCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                }
              />
            )}

            {view === 'creatives' && creatives.data && creatives.data.data.length === 0 && (
              <EmptyState
                title="Nobody listed here yet"
                description={
                  subdomain
                    ? 'This sub-domain has no published creatives yet.'
                    : domain
                      ? 'This domain has no published creatives yet.'
                      : municipality
                        ? 'No published creatives in that municipality yet.'
                        : 'Published creatives will appear here as the registry grows.'
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={() => setView('offers')}>
                      Browse offers
                    </Button>
                    {activeFilterCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                }
              />
            )}

            {view === 'offers' && offers.data && offers.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {offers.data.data.map((offer) => {
                  const creativeName = offer.creative.displayName ?? offer.creative.slug;
                  return (
                    <li key={offer.id}>
                      <Link
                        to={`/offers/${offer.id}`}
                        className="group flex flex-col gap-4 py-6 transition-colors hover:bg-clay-50/60 sm:flex-row sm:items-start sm:gap-6"
                      >
                        {offer.image ? (
                          <img
                            src={offer.image.thumbUrl}
                            alt=""
                            width={120}
                            height={120}
                            loading="lazy"
                            decoding="async"
                            className="size-[120px] shrink-0 object-cover"
                          />
                        ) : (
                          <div className="size-[120px] shrink-0 bg-clay-100" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="u-display text-xl text-ink group-hover:text-lawa-700">
                              {offer.title}
                            </h2>
                            <Badge tone="brand">{offer.subdomain.name}</Badge>
                          </div>
                          <p className="mt-1 text-sm font-medium text-ink">
                            {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <Avatar
                              src={offer.creative.avatarUrl}
                              name={creativeName}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm text-ink">{creativeName}</p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                                <MapPin className="size-3" aria-hidden />
                                {offer.creative.municipality}
                                {offer.creative.isNearby && (
                                  <Badge tone="accent">Nearby</Badge>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {view === 'creatives' && creatives.data && creatives.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {creatives.data.data.map((profile) => {
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
