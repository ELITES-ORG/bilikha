import { Link, useSearchParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Button, ButtonLink, Container, EmptyState, SectionHeading, Skeleton, useToast } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useHistory } from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { useSavedOffers, useUnsaveOffer } from '@/features/me/saved-offers';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type HistorySegment = 'inquired' | 'saved';

function parseSegment(raw: string | null): HistorySegment {
  return raw === 'saved' ? 'saved' : 'inquired';
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const segment = parseSegment(params.get('segment'));
  const toast = useToast();
  const history = useHistory();
  const saved = useSavedOffers(segment === 'saved');
  const unsave = useUnsaveOffer();

  function setSegment(next: HistorySegment) {
    const merged = new URLSearchParams(params);
    if (next === 'inquired') merged.delete('segment');
    else merged.set('segment', next);
    setParams(merged, { replace: true });
  }

  async function onUnsave(offerId: string) {
    await toast.run(
      'Removing…',
      () => unsave.mutateAsync(offerId),
      {
        success: 'Removed from saved',
        error: (err) => toApiError(err).message,
      },
    );
  }

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="History"
            title="Offers you care about"
            description="Inquiries you sent, and offers you saved for later."
          />

          <div
            role="tablist"
            aria-label="History segments"
            className="mt-8 flex gap-6 border-b border-hairline"
          >
            <button
              type="button"
              role="tab"
              aria-selected={segment === 'inquired'}
              className={cn(
                'border-b-2 pb-2 text-sm font-medium transition-colors',
                segment === 'inquired'
                  ? 'border-lawa-700 text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              onClick={() => setSegment('inquired')}
            >
              Inquired
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={segment === 'saved'}
              className={cn(
                'border-b-2 pb-2 text-sm font-medium transition-colors',
                segment === 'saved'
                  ? 'border-lawa-700 text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
              onClick={() => setSegment('saved')}
            >
              Saved
            </button>
          </div>

          <div className="mt-8">
            {segment === 'inquired' && (
              <>
                {history.isPending && <Skeleton className="h-40 w-full" />}

                {history.isError && (
                  <p className="text-danger-700">{history.error.message}</p>
                )}

                {history.data && history.data.length === 0 && (
                  <EmptyState
                    title="No inquiries yet"
                    description="Browse the directory and inquire about an offer — it will show up here."
                    action={
                      <ButtonLink to="/directory" size="sm">
                        Browse the directory
                      </ButtonLink>
                    }
                  />
                )}

                {history.data && history.data.length > 0 && (
                  <ul className="divide-y divide-hairline border border-hairline">
                    {history.data.map((row) => {
                      const threadId = row.conversationId ?? row.id;
                      const askedAt = row.lastAskedAt ?? row.startedAt;
                      return (
                        <li key={row.id}>
                          <Link
                            to={`/messages/${threadId}`}
                            className="flex gap-3 px-4 py-4 transition-colors hover:bg-clay-50"
                          >
                            {row.offer?.image ? (
                              <img
                                src={row.offer.image.thumbUrl}
                                alt=""
                                width={56}
                                height={56}
                                className="size-14 shrink-0 object-cover"
                              />
                            ) : (
                              <div className="size-14 shrink-0 bg-clay-100" aria-hidden />
                            )}

                            <div className="min-w-0 flex-1">
                              {row.offer ? (
                                <>
                                  <p className="truncate font-medium text-ink">{row.offer.title}</p>
                                  <p className="mt-0.5 text-sm text-ink-muted">
                                    {formatPriceRange(
                                      row.offer.priceMinCentavos,
                                      row.offer.priceMaxCentavos,
                                    )}
                                  </p>
                                </>
                              ) : (
                                <p className="font-medium text-ink">Offer no longer listed</p>
                              )}

                              <p className="mt-1 truncate text-sm text-ink-muted">
                                {row.creative.displayName}
                                {row.creative.municipality
                                  ? ` · ${row.creative.municipality}`
                                  : ''}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                                {askedAt && (
                                  <time dateTime={askedAt}>
                                    Last asked {relativeTime(askedAt)}
                                  </time>
                                )}
                                <span
                                  className={cn(
                                    row.replied ? 'text-success-700' : 'text-ink-subtle',
                                  )}
                                >
                                  {row.replied ? 'Replied' : 'No reply yet'}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {segment === 'saved' && (
              <>
                {saved.isPending && <Skeleton className="h-40 w-full" />}

                {saved.isError && (
                  <p className="text-danger-700">{saved.error.message}</p>
                )}

                {saved.data && saved.data.length === 0 && (
                  <EmptyState
                    title="Nothing saved yet"
                    description="Save offers from the directory to find them again here."
                    action={
                      <ButtonLink to="/directory" size="sm">
                        Browse the directory
                      </ButtonLink>
                    }
                  />
                )}

                {saved.data && saved.data.length > 0 && (
                  <ul className="divide-y divide-hairline border border-hairline">
                    {saved.data.map((row) => (
                      <li key={row.id} className="flex items-start gap-3 px-4 py-4">
                        <Link
                          to={`/offers/${row.offer.id}`}
                          className="flex min-w-0 flex-1 gap-3 transition-opacity hover:opacity-90"
                        >
                          {row.offer.image ? (
                            <img
                              src={row.offer.image.thumbUrl}
                              alt=""
                              width={56}
                              height={56}
                              className="size-14 shrink-0 object-cover"
                            />
                          ) : (
                            <div className="size-14 shrink-0 bg-clay-100" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{row.offer.title}</p>
                            <p className="mt-0.5 text-sm text-ink-muted">
                              {formatPriceRange(
                                row.offer.priceMinCentavos,
                                row.offer.priceMaxCentavos,
                              )}
                            </p>
                            <p className="mt-1 truncate text-sm text-ink-muted">
                              {row.creative.displayName}
                              {row.creative.municipality
                                ? ` · ${row.creative.municipality}`
                                : ''}
                            </p>
                          </div>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          loading={unsave.isPending}
                          onClick={() => void onUnsave(row.offer.id).catch(() => undefined)}
                        >
                          Unsave
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
