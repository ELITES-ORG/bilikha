import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Inbox } from 'lucide-react';
import { useAdminCounts, useAdminProfiles } from '@/features/admin/api';
import type { QueueStatus } from '@/features/admin/types';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { RequireAdmin } from '@/features/auth/RequireAdmin';
import { Badge, Button, ButtonLink, Container, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pbBottomNav } from '@/lib/bottom-nav';

const TABS: Array<{ status: QueueStatus; label: string }> = [
  { status: 'pending_review', label: 'Pending' },
  { status: 'edited', label: 'Edited' },
  { status: 'published', label: 'Published' },
  { status: 'suspended', label: 'Suspended' },
];

function waitingLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'Less than an hour';
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function AdminQueuePage() {
  return (
    <RequireAdmin>
      <AdminQueueInner />
    </RequireAdmin>
  );
}

function AdminQueueInner() {
  const [status, setStatus] = useState<QueueStatus>('pending_review');
  const [page, setPage] = useState(1);
  const counts = useAdminCounts();
  const list = useAdminProfiles(status, page);

  const totalPages = useMemo(() => {
    const total = list.data?.meta.total ?? 0;
    const limit = list.data?.meta.limit ?? 20;
    return Math.max(1, Math.ceil(total / limit));
  }, [list.data]);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="wide" className="flex h-16 items-center justify-between">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
          <ButtonLink to="/" variant="ghost" size="sm">
            Back to site
          </ButtonLink>
        </Container>
      </header>
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="wide" className="py-(--section-gap)">
          <p className="u-eyebrow">Administration</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Review queue</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Oldest registrations first. Approve to publish, or reject with a reason the registrant
            will see.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink to="/admin/media" variant="secondary" size="sm">
              Media review
            </ButtonLink>
            <ButtonLink to="/admin/accounts" variant="secondary" size="sm">
              Accounts
            </ButtonLink>
            <ButtonLink to="/admin/ratings" variant="secondary" size="sm">
              Reported ratings
            </ButtonLink>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 border-b border-hairline pb-px">
            {TABS.map((tab) => {
              const count = counts.data?.[tab.status] ?? 0;
              const active = status === tab.status;
              return (
                <button
                  key={tab.status}
                  type="button"
                  onClick={() => {
                    setStatus(tab.status);
                    setPage(1);
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-lawa-700 text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {tab.label}
                  <Badge tone={active ? 'brand' : 'neutral'}>{count}</Badge>
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            {list.isPending && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            )}

            {list.isError && (
              <EmptyState
                icon={<Inbox className="size-5" />}
                title="Could not load the queue"
                description={list.error.message}
              />
            )}

            {list.data && list.data.data.length === 0 && (
              <EmptyState
                icon={<CheckCircle2 className="size-5" />}
                title={
                  status === 'edited'
                    ? 'No published edits waiting'
                    : 'Nothing waiting for review'
                }
                description={
                  status === 'edited'
                    ? 'Public changes to published profiles will appear here until they are acknowledged.'
                    : 'An empty pending queue is a good outcome — every registration has been decided.'
                }
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-ink-subtle">
                      <th className="py-3 pr-4 font-medium">Name</th>
                      <th className="py-3 pr-4 font-medium">Username</th>
                      <th className="py-3 pr-4 font-medium">Municipality</th>
                      <th className="py-3 pr-4 font-medium">Crafts</th>
                      <th className="py-3 font-medium">Waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data.map((row) => (
                      <tr key={row.id} className="border-b border-hairline">
                        <td className="py-3 pr-4">
                          <Link
                            to={`/admin/profiles/${row.id}`}
                            className="font-medium text-lawa-800 link-underline"
                          >
                            {row.firstName} {row.lastName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-ink-muted">{row.username}</td>
                        <td className="py-3 pr-4 text-ink-muted">{row.municipality}</td>
                        <td className="py-3 pr-4 text-ink-muted">{row.subdomainCount}</td>
                        <td className="py-3 text-ink-muted">
                          {waitingLabel(
                            status === 'edited'
                              ? (row.editedSinceReviewAt ?? row.createdAt)
                              : row.createdAt,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {list.data && list.data.meta.total > list.data.meta.limit && (
              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="text-sm text-ink-subtle">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
