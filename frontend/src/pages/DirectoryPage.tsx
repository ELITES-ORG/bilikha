import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListFilter, MapPin, TriangleAlert, X } from 'lucide-react';
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
import { usePublishedOffers } from '@/features/offers/api';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { formatPriceRange } from '@/lib/money';
import { cn } from '@/lib/cn';

function parseBudget(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
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
  const list = usePublishedOffers({
    domain,
    subdomain,
    municipality,
    budgetMin,
    budgetMax,
    page,
    limit: 20,
  });

  const selectedDomain = useMemo(
    () => domains.data?.find((d) => d.slug === domain),
    [domains.data, domain],
  );

  const nearbyMunicipalityName = user?.municipalityName ?? null;
  const creativesSearch = params.toString() ? `?${params}` : '';

  const activeFilterCount = [
    domain,
    subdomain,
    municipality,
    budgetMin,
    budgetMax,
  ].filter((v) => v != null && v !== '').length;

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

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit)) : 1;
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
            eyebrow="Find a service"
            title="Directory"
            description="Browse published offers by domain, sub-domain, or municipality. Nothing here requires an account."
          />

          <p className="mt-4 text-sm text-ink-muted">
            <Link to={`/creatives${creativesSearch}`} className="link-underline text-lawa-700">
              Browse creatives
            </Link>
          </p>

          <div className="relative mt-8 border-b border-hairline pb-6">
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
                      <p className="text-xs text-danger-700">Maximum must be at least the minimum.</p>
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
                </div>
              </div>
            )}
          </div>

          <div className="mt-10">
            {nearbyMunicipalityName && !municipality && (
              <p className="mb-6 text-sm text-ink-muted">
                Showing offers from creatives in {nearbyMunicipalityName} first
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
                title="No offers here yet — browse creatives in this sub-domain instead."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <ButtonLink to={`/creatives${creativesSearch}`} size="sm">
                      Browse creatives
                    </ButtonLink>
                    {activeFilterCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                }
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {list.data.data.map((offer) => {
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
