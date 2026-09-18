import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListFilter, MapPin, TriangleAlert, X } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ModeSwitch } from '@/components/ModeSwitch';
import { effectiveViewMode } from '@/lib/view-mode';
import { ModeAwareEmptyState } from '@/components/ModeAwareEmptyState';
import {
  Avatar,
  Badge,
  Button,
  Container,
  EmptyState,
  SectionHeading,
  Select,
  Skeleton,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { usePostingsFeed } from '@/features/postings/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { usePublishedOffers } from '@/features/offers/api';
import { usePublishedProfiles } from '@/features/profiles/api';
import { useCreativeDomains, useMunicipalities } from '@/features/taxonomy/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { formatPriceRange } from '@/lib/money';
import { formatTimeLeft } from '@/lib/posting-time';
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

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
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
  const mode = effectiveViewMode(user);
  const hasProfile = Boolean(user?.profileSlug);
  const creativeHome = hasProfile && mode === 'creative';

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
    view === 'offers' && !creativeHome,
  );
  const creatives = usePublishedProfiles(
    {
      domain,
      subdomain,
      municipality,
      page,
      limit: 20,
    },
    view === 'creatives' && !creativeHome,
  );
  const postings = usePostingsFeed(
    { domain, subdomain, municipality, page, limit: 20 },
    creativeHome,
  );

  const list = creativeHome ? postings : view === 'offers' ? offers : creatives;

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
    // Only the tab switch transitions. Filters and pagination go through
    // setFilter above and stay instant: a view transition freezes the page
    // while it runs, and one on every filter tap reads as lag, not polish.
    setParams(merged, { replace: true, viewTransition: true });
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
            eyebrow={creativeHome ? 'Creative work' : 'Find work or people'}
            title={creativeHome ? 'Client postings' : 'Directory'}
            description={
              // Accounts with a profile get the mode line below the switch
              // instead, so the explanation sits next to the control it
              // explains rather than above it.
              hasProfile
                ? undefined
                : user
                  ? 'Offers and creatives you can hire.'
                  : 'Browse published offers and creatives. Nothing here requires an account.'
            }
          />

          {/* Posting actions live on the account page now: this is a browse
              surface, and managing your own postings is not browsing. */}
          <div className="mt-6">
            <ModeSwitch size="md" />
          </div>

          {/* The switch decides three surfaces, not just this feed, and nothing
              else says so. Sits under the control rather than above it. */}
          {hasProfile && (
            <p className="mt-3 max-w-prose text-sm text-ink-muted">
              {creativeHome
                ? 'Showing work clients have posted, matched to your sub-domains first. Messages and History follow this mode too.'
                : 'Showing offers and creatives you can hire. Messages and History follow this mode too.'}
            </p>
          )}

          <div className="relative mt-8">
            <div className="flex items-center justify-between gap-3 border-b border-hairline">
              {!creativeHome && (
                <div role="tablist" aria-label="Directory sections" className="flex gap-6">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'offers'}
                    className={cn(
                      '-mb-px border-b-2 pb-2 text-sm font-medium transition-colors',
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
                      '-mb-px border-b-2 pb-2 text-sm font-medium transition-colors',
                      view === 'creatives'
                        ? 'border-lawa-700 text-ink'
                        : 'border-transparent text-ink-muted hover:text-ink',
                    )}
                    onClick={() => setView('creatives')}
                  >
                    Creatives
                  </button>
                </div>
              )}
              {creativeHome && (
                <p className="-mb-px border-b-2 border-lawa-700 pb-2 text-sm font-medium text-ink">
                  Postings
                </p>
              )}

              <button
                type="button"
                className="relative mb-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-clay-100 hover:text-ink"
                aria-label="Quick filters"
                aria-expanded={filtersOpen}
                aria-controls="directory-filters"
                onClick={() => (filtersOpen ? setFiltersOpen(false) : openFilters())}
              >
                <ListFilter className="size-4" aria-hidden />
                {activeFilterCount > 0 && (
                  <Badge
                    tone="accent"
                    className="absolute -right-1 -top-1 min-w-4 justify-center px-1 tabular-nums"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </button>
            </div>

            {filtersOpen && (
              <div
                id="directory-filters"
                ref={panelRef}
                role="dialog"
                aria-label="Quick filters"
                className={cn(
                  'absolute inset-x-0 top-full z-20 mt-2 rounded-md border border-hairline bg-surface p-4 shadow-md',
                  'md:left-auto md:right-0 md:w-full md:max-w-lg',
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-ink">Filters</p>
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
                  <Select
                    label="Domain"
                    value={domain ?? ''}
                    placeholder="All domains"
                    onValueChange={(next) =>
                      setFilter({ domain: next || undefined, subdomain: undefined })
                    }
                    options={[
                      { value: '', label: 'All domains' },
                      ...(domains.data ?? []).map((d) => ({ value: d.slug, label: d.name })),
                    ]}
                  />

                  <Select
                    label="Sub-domain"
                    value={subdomain ?? ''}
                    placeholder="All sub-domains"
                    disabled={!selectedDomain}
                    onValueChange={(next) => setFilter({ subdomain: next || undefined })}
                    options={[
                      { value: '', label: 'All sub-domains' },
                      ...(selectedDomain?.subdomains ?? []).map((sd) => ({
                        value: sd.slug,
                        label: sd.name,
                      })),
                    ]}
                  />

                  <Select
                    label="Municipality"
                    value={municipality ?? ''}
                    placeholder="All municipalities"
                    onValueChange={(next) => setFilter({ municipality: next || undefined })}
                    options={[
                      { value: '', label: 'All municipalities' },
                      ...(municipalities.data ?? []).map((m) => ({
                        value: m.slug,
                        label: m.name,
                      })),
                    ]}
                  />

                  {!creativeHome && view === 'offers' && (
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
            {nearbyMunicipalityName && !municipality && !creativeHome && (
              <p className="mb-6 text-sm text-ink-muted">
                {view === 'offers'
                  ? `Showing offers from creatives in ${nearbyMunicipalityName} first`
                  : `Showing creatives in ${nearbyMunicipalityName} first`}
              </p>
            )}
            {creativeHome && nearbyMunicipalityName && !municipality && (
              <p className="mb-6 text-sm text-ink-muted">
                {`Showing postings in ${nearbyMunicipalityName} higher in the list`}
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
                title={
                  creativeHome
                    ? 'Could not load postings'
                    : view === 'offers'
                      ? 'Could not load offers'
                      : 'Could not load creatives'
                }
                description={list.error.message}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {creativeHome && postings.data && postings.data.data.length === 0 && (
              <ModeAwareEmptyState
                title="No postings yet"
                description="You are viewing “I’m for hire”. No postings match your sub-domains yet — switch to “I’m hiring” to browse creatives and post your own work."
                extraAction={
                  activeFilterCount > 0 ? (
                    <Button size="sm" variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}

            {view === 'offers' && offers.data && offers.data.data.length === 0 && !creativeHome && (
              user?.profileSlug ? (
                <ModeAwareEmptyState
                  title="No offers here yet"
                  description="You are viewing “I’m hiring”. No offers match these filters yet — switch to “I’m for hire” to browse client postings, or try another filter."
                  extraAction={
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
              ) : (
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
              )
            )}

            {view === 'creatives' && creatives.data && creatives.data.data.length === 0 && !creativeHome && (
              user?.profileSlug ? (
                <ModeAwareEmptyState
                  title="Nobody listed here yet"
                  description="You are viewing “I’m hiring”. No creatives match these filters yet — switch to “I’m for hire” for client postings, or browse offers instead."
                  extraAction={
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
              ) : (
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
              )
            )}

            {!creativeHome && view === 'offers' && offers.data && offers.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {offers.data.data.map((offer) => {
                  const creativeName = offer.creative.displayName ?? offer.creative.slug;
                  // Same craft on every row when that filter is already on.
                  const showSubdomain = !subdomain;
                  // The "your town first" line already explains proximity.
                  const showNearby =
                    Boolean(offer.creative.isNearby) &&
                    !(nearbyMunicipalityName && !municipality);
                  const thumbClass =
                    'size-20 shrink-0 object-cover sm:size-[120px]';

                  return (
                    <li key={offer.id}>
                      <Link
                        to={`/offers/${offer.id}`}
                        className="group flex flex-row items-start gap-3 py-5 transition-colors hover:bg-clay-50/60 sm:gap-6 sm:py-6"
                      >
                        {offer.image ? (
                          <img
                            src={offer.image.thumbUrl}
                            alt=""
                            width={120}
                            height={120}
                            loading="lazy"
                            decoding="async"
                            className={thumbClass}
                          />
                        ) : offer.creative.avatarUrl ? (
                          <img
                            src={offer.creative.avatarUrl}
                            alt=""
                            width={120}
                            height={120}
                            loading="lazy"
                            decoding="async"
                            className={thumbClass}
                          />
                        ) : (
                          <div
                            className={cn(
                              thumbClass,
                              'flex items-center justify-center bg-lawa-100 text-lawa-800',
                            )}
                            aria-hidden
                          >
                            <span className="text-sm font-medium tabular-nums sm:text-base">
                              {initialsFrom(creativeName)}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h2
                            className="u-display line-clamp-2 text-xl text-ink text-pretty group-hover:text-lawa-700"
                            title={offer.title}
                          >
                            {offer.title}
                          </h2>
                          {showSubdomain && (
                            <p className="mt-1 text-xs tracking-wide text-ink-muted">
                              {offer.subdomain.name}
                            </p>
                          )}
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
                                <span>{offer.creative.municipality}</span>
                                {showNearby && <span>· Nearby</span>}
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

            {creativeHome && postings.data && postings.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {postings.data.data.map((posting) => {
                  const clientName = posting.client?.name ?? 'Client';
                  return (
                    <li key={posting.id}>
                      <Link
                        to={`/postings/${posting.id}`}
                        className="group flex flex-col gap-4 py-6 transition-colors hover:bg-clay-50/60 sm:flex-row sm:items-start sm:gap-6"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="u-display text-xl text-ink group-hover:text-lawa-700">
                              {posting.title}
                            </h2>
                            <Badge tone="brand">{posting.subdomain.name}</Badge>
                            {posting.hasReplied && <Badge tone="accent">Replied</Badge>}
                          </div>
                          <p className="mt-1 text-sm font-medium text-ink">
                            {formatPriceRange(
                              posting.budgetMinCentavos,
                              posting.budgetMaxCentavos,
                            )}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                            <MapPin className="size-3.5" aria-hidden />
                            {posting.municipality.name}
                            <Badge tone="neutral">{formatTimeLeft(posting.expiresAt)}</Badge>
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <Avatar
                              src={posting.client?.avatarUrl}
                              name={clientName}
                              size="sm"
                            />
                            <p className="text-sm text-ink">{clientName}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {!creativeHome && view === 'creatives' && creatives.data && creatives.data.data.length > 0 && (
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
