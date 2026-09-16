import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { ButtonLink, Container, EmptyState, SectionHeading, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useHistory } from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

export function HistoryPage() {
  const history = useHistory();

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="History"
            title="What you inquired about"
            description="Offers and creatives you contacted, and whether they replied."
          />

          <div className="mt-10">
            {history.isPending && <Skeleton className="h-40 w-full" />}

            {history.isError && (
              <p className="text-danger-700">{history.error.message}</p>
            )}

            {history.data && history.data.length === 0 && (
              <EmptyState
                title="No inquiries yet"
                description="Browse the directory and contact a creative about an offer — it will show up here."
                action={
                  <ButtonLink to="/directory" size="sm">
                    Browse the directory
                  </ButtonLink>
                }
              />
            )}

            {history.data && history.data.length > 0 && (
              <ul className="divide-y divide-hairline border border-hairline">
                {history.data.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/messages/${row.id}`}
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
                        <div
                          className="size-14 shrink-0 bg-clay-100"
                          aria-hidden
                        />
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
                          <p className="font-medium text-ink">
                            Contacted from their profile
                          </p>
                        )}

                        <p className="mt-1 truncate text-sm text-ink-muted">
                          {row.creative.displayName}
                          {row.creative.municipality
                            ? ` · ${row.creative.municipality}`
                            : ''}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
                          <time dateTime={row.startedAt}>
                            Inquired {relativeTime(row.startedAt)}
                          </time>
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
                ))}
              </ul>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
