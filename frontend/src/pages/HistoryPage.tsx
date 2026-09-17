import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { ModeSwitch } from '@/components/ModeSwitch';
import { effectiveViewMode } from '@/lib/view-mode';
import { ModeAwareEmptyState } from '@/components/ModeAwareEmptyState';
import { Avatar, Button, ButtonLink, Container, SectionHeading, Skeleton, useToast } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useAgreements } from '@/features/agreements/api';
import { AgreementStateChip } from '@/features/agreements/AgreementCard';
import { scheduleLine } from '@/features/agreements/format';
import { useHistory } from '@/features/conversations/api';
import type { CreativeHistoryItem, HistoryItem } from '@/features/conversations/types';
import { relativeTime } from '@/features/conversations/relative-time';
import { useSavedOffers, useUnsaveOffer } from '@/features/me/saved-offers';
import { formatPesos, formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type HistorySegment = 'inquired' | 'saved' | 'agreements';

function parseSegment(raw: string | null): HistorySegment {
  if (raw === 'saved') return 'saved';
  if (raw === 'agreements') return 'agreements';
  return 'inquired';
}

function isCreativeHistoryItem(row: HistoryItem | CreativeHistoryItem): row is CreativeHistoryItem {
  return 'client' in row && !('creative' in row);
}

function SegmentTab({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'border-b-2 pb-2 text-sm font-medium transition-colors',
        active ? 'border-lawa-700 text-ink' : 'border-transparent text-ink-muted hover:text-ink',
      )}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const mode = effectiveViewMode(user);
  const creativeMode = mode === 'creative' && Boolean(user?.profileSlug);

  // Saved offers are a hiring-side idea only, so that segment is not offered
  // on the creative side and a stale ?segment=saved falls back to the first tab.
  const requested = parseSegment(params.get('segment'));
  const segment = creativeMode && requested === 'saved' ? 'inquired' : requested;

  const history = useHistory(mode);
  const saved = useSavedOffers(segment === 'saved' && !creativeMode);
  const agreements = useAgreements(mode, segment === 'agreements');
  const unsave = useUnsaveOffer();

  /**
   * Awaiting a response first, then by start date — the order the server
   * already returns, mirrored here so the list reads the same either way.
   */
  const agreementRows = useMemo(() => {
    const awaiting = (status: string) => (status === 'sent' ? 0 : 1);
    return [...(agreements.data ?? [])].sort(
      (a, b) =>
        awaiting(a.status) - awaiting(b.status) || a.startDate.localeCompare(b.startDate),
    );
  }, [agreements.data]);

  function setSegment(next: HistorySegment) {
    const merged = new URLSearchParams(params);
    if (next === 'inquired') merged.delete('segment');
    else merged.set('segment', next);
    setParams(merged, { replace: true, viewTransition: true });
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

  const hiringInquiredEmpty =
    'You are viewing “I’m hiring”. No inquiries yet — browse offers on Home and inquire, or switch to “I’m for hire” to see postings you replied to.';
  const hiringSavedEmpty =
    'You are viewing “I’m hiring”. Nothing saved yet — save offers while browsing, or switch to “I’m for hire” for posting replies.';
  const creativeHistoryEmpty =
    'You are viewing “I’m for hire”. You have not replied to any postings yet — browse client work on Home, or switch to “I’m hiring” for offers you inquired about.';
  const hiringAgreementsEmpty =
    'You are viewing “I’m hiring”. No work agreements yet — a creative sends one into your conversation once you have settled on the work, or switch to “I’m for hire” to see the ones you issued.';
  const creativeAgreementsEmpty =
    'You are viewing “I’m for hire”. You have not sent any work agreements yet — open a conversation and draft one, or switch to “I’m hiring” to see the ones you received.';

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="History"
            title={creativeMode ? 'Postings you replied to' : 'Offers you care about'}
            description={
              creativeMode
                ? 'Client postings where you sent a reply, and the work agreements you issued.'
                : 'Inquiries you sent, offers you saved, and work agreements you received.'
            }
          />

          <div className="mt-6">
            <ModeSwitch size="md" />
          </div>

          <div
            role="tablist"
            aria-label="History segments"
            className="mt-8 flex gap-6 border-b border-hairline"
          >
            <SegmentTab
              label={creativeMode ? 'Replied' : 'Inquired'}
              active={segment === 'inquired'}
              onSelect={() => setSegment('inquired')}
            />
            {!creativeMode && (
              <SegmentTab
                label="Saved"
                active={segment === 'saved'}
                onSelect={() => setSegment('saved')}
              />
            )}
            <SegmentTab
              label="Agreements"
              active={segment === 'agreements'}
              onSelect={() => setSegment('agreements')}
            />
          </div>

          <div className="mt-8">
            {segment === 'inquired' && creativeMode && (
              <>
                {history.isPending && <Skeleton className="h-40 w-full" />}

                {history.isError && <p className="text-danger-700">{history.error.message}</p>}

                {history.data && history.data.length === 0 && (
                  <ModeAwareEmptyState
                    title="No posting replies yet"
                    description={creativeHistoryEmpty}
                    extraAction={
                      <ButtonLink to="/directory" size="sm" variant="secondary">
                        Browse postings
                      </ButtonLink>
                    }
                  />
                )}

                {history.data && history.data.length > 0 && (
                  <ul className="divide-y divide-hairline border border-hairline">
                    {(history.data as CreativeHistoryItem[]).filter(isCreativeHistoryItem).map((row) => {
                      const askedAt = row.lastRepliedAt;
                      return (
                        <li key={row.posting?.id ?? row.conversationId}>
                          <Link
                            to={`/messages/${row.conversationId}`}
                            className="flex gap-3 px-4 py-4 transition-colors hover:bg-clay-50"
                          >
                            <Avatar
                              src={row.client.avatarUrl}
                              name={row.client.name}
                              size="sm"
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              {row.posting ? (
                                <>
                                  <p className="truncate font-medium text-ink">{row.posting.title}</p>
                                  <p className="mt-0.5 text-sm text-ink-muted">
                                    {formatPriceRange(
                                      row.posting.budgetMinCentavos,
                                      row.posting.budgetMaxCentavos,
                                    )}
                                  </p>
                                </>
                              ) : (
                                <p className="font-medium text-ink">Posting no longer listed</p>
                              )}
                              <p className="mt-1 truncate text-sm text-ink-muted">
                                {row.client.name}
                                {row.client.municipality ? ` · ${row.client.municipality}` : ''}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                                {askedAt && (
                                  <time dateTime={askedAt}>
                                    Last replied {relativeTime(askedAt)}
                                  </time>
                                )}
                                <span
                                  className={cn(
                                    row.replied ? 'text-success-700' : 'text-ink-subtle',
                                  )}
                                >
                                  {row.replied ? 'Client replied' : 'No client reply yet'}
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

            {segment === 'inquired' && !creativeMode && (
              <>
                {history.isPending && <Skeleton className="h-40 w-full" />}

                {history.isError && <p className="text-danger-700">{history.error.message}</p>}

                {history.data && history.data.length === 0 && (
                  <ModeAwareEmptyState
                    title="No inquiries yet"
                    description={hiringInquiredEmpty}
                    extraAction={
                      <ButtonLink to="/directory" size="sm" variant="secondary">
                        Browse Home
                      </ButtonLink>
                    }
                  />
                )}

                {history.data && history.data.length > 0 && (
                  <ul className="divide-y divide-hairline border border-hairline">
                    {(history.data as HistoryItem[]).map((row) => {
                      const threadId = row.conversationId ?? row.id ?? row.offer?.id ?? '';
                      const askedAt = row.lastAskedAt ?? row.startedAt;
                      const rowKey = row.offer?.id ?? threadId;
                      return (
                        <li key={rowKey}>
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
                                {row.creative.municipality ? ` · ${row.creative.municipality}` : ''}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                                {askedAt && (
                                  <time dateTime={askedAt}>Last asked {relativeTime(askedAt)}</time>
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

            {segment === 'saved' && !creativeMode && (
              <>
                {saved.isPending && <Skeleton className="h-40 w-full" />}

                {saved.isError && <p className="text-danger-700">{saved.error.message}</p>}

                {saved.data && saved.data.length === 0 && (
                  <ModeAwareEmptyState
                    title="Nothing saved yet"
                    description={hiringSavedEmpty}
                    extraAction={
                      <ButtonLink to="/directory" size="sm" variant="secondary">
                        Browse Home
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
                              {row.creative.municipality ? ` · ${row.creative.municipality}` : ''}
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

            {segment === 'agreements' && (
              <>
                {agreements.isPending && <Skeleton className="h-40 w-full" />}

                {agreements.isError && (
                  <p className="text-danger-700">{agreements.error.message}</p>
                )}

                {agreements.data && agreementRows.length === 0 && (
                  <ModeAwareEmptyState
                    title="No work agreements yet"
                    description={creativeMode ? creativeAgreementsEmpty : hiringAgreementsEmpty}
                    extraAction={
                      <ButtonLink to="/messages" size="sm" variant="secondary">
                        Open messages
                      </ButtonLink>
                    }
                  />
                )}

                {agreementRows.length > 0 && (
                  <ul className="divide-y divide-hairline border border-hairline">
                    {agreementRows.map((row) => (
                      <li key={row.id}>
                        <Link
                          to={`/agreements/${row.id}`}
                          className="block px-4 py-4 transition-colors hover:bg-clay-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate font-medium text-ink">
                              {row.packageTitle}
                            </p>
                            <AgreementStateChip state={row.state} className="shrink-0" />
                          </div>
                          <p className="mt-0.5 text-sm text-ink-muted">
                            {formatPesos(row.totalCentavos)}
                          </p>
                          <p className="mt-1 truncate text-sm text-ink-muted">
                            {row.otherPartyName}
                            {row.version > 1 ? ` · version ${row.version}` : ''}
                          </p>
                          <p className="mt-2 text-xs text-ink-subtle">
                            {scheduleLine(row.startDate, row.endDate)}
                          </p>
                        </Link>
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
