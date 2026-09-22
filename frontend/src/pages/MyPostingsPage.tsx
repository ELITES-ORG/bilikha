import { Link } from 'react-router-dom';
import { CircleAlert, Clock } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Badge,
  Button,
  ButtonLink,
  Container,
  EmptyState,
  SectionHeading,
  Skeleton,
  useToast,
} from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useClosePosting, useDeletePosting, useMyPostings } from '@/features/postings/api';
import {
  formatTimeLeft,
  expiryTone,
  effectivePostingStatus,
  formatPostingStatus,
} from '@/lib/posting-time';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';

function postingStatusTone(status: string): 'neutral' | 'warning' {
  // Expired lapsed without a deliberate close — it should not look like Closed.
  return status === 'expired' ? 'warning' : 'neutral';
}

export function MyPostingsPage() {
  const list = useMyPostings();
  const close = useClosePosting();
  const del = useDeletePosting();
  const toast = useToast();

  async function onClose(id: string) {
    await toast.run(
      'Closing…',
      () => close.mutateAsync(id),
      { success: 'Posting closed', error: (err) => toApiError(err).message },
    );
  }

  async function onDelete(id: string) {
    await toast.run(
      'Deleting…',
      () => del.mutateAsync(id),
      { success: 'Posting deleted', error: (err) => toApiError(err).message },
    );
  }

  const empty = list.data && list.data.length === 0;
  const populated = Boolean(list.data && list.data.length > 0);

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Hiring"
            title="Your postings"
            description="Work you want done. Close a posting when it is filled or no longer needed."
            action={
              populated ? <ButtonLink to="/postings/new">Post work</ButtonLink> : undefined
            }
          />

          <div className="mt-10">
            {list.isPending && <Skeleton className="h-40 w-full" />}
            {list.isError && <p className="text-danger-700">{list.error.message}</p>}

            {empty && (
              <EmptyState
                title="No postings yet"
                description="Publish work you need done — matching creatives will see it on their Home feed."
                action={<ButtonLink to="/postings/new" size="sm">Post work</ButtonLink>}
              />
            )}

            {populated && (
              <ul className="divide-y divide-hairline border border-hairline">
                {list.data!.map((row) => {
                  const status = effectivePostingStatus(row.status, row.expiresAt);
                  const open = status === 'open';
                  const timeTone = open ? expiryTone(row.expiresAt) : null;
                  return (
                    <li key={row.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={`/postings/${row.id}`}
                            className="u-display text-lg text-ink hover:text-lawa-700"
                          >
                            {row.title}
                          </Link>
                          <p className="mt-1 text-sm text-ink-muted">
                            {formatPriceRange(row.budgetMinCentavos, row.budgetMaxCentavos)}
                            {' · '}
                            {row.subdomain.name}
                            {' · '}
                            {row.municipality.name}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {!open && (
                              <Badge
                                tone={postingStatusTone(status)}
                                icon={
                                  status === 'expired' ? (
                                    <CircleAlert className="size-3" aria-hidden />
                                  ) : undefined
                                }
                              >
                                {formatPostingStatus(status)}
                              </Badge>
                            )}
                            {open && timeTone && (
                              <Badge
                                tone={timeTone}
                                icon={
                                  timeTone === 'warning' || timeTone === 'danger' ? (
                                    <Clock className="size-3" aria-hidden />
                                  ) : undefined
                                }
                              >
                                {formatTimeLeft(row.expiresAt)}
                              </Badge>
                            )}
                            {(row.replyCount ?? 0) > 0 && (
                              <Badge tone="neutral">
                                {row.replyCount} {row.replyCount === 1 ? 'reply' : 'replies'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {open && (
                            <>
                              <ButtonLink to={`/postings/${row.id}/edit`} size="sm" variant="secondary">
                                Edit
                              </ButtonLink>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                loading={close.isPending}
                                onClick={() => void onClose(row.id).catch(() => undefined)}
                              >
                                Close
                              </Button>
                            </>
                          )}
                          {(row.replyCount ?? 0) === 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              loading={del.isPending}
                              onClick={() => void onDelete(row.id).catch(() => undefined)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Container>
      </main>
    </>
  );
}
