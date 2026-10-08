import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react';
import { useAdminCounts, useAdminProfiles } from '@/features/admin/api';
import type { QueueStatus } from '@/features/admin/types';
import { Avatar, Button, Container, EmptyState, Skeleton, Tabs } from '@/components/ui';
import {
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTabLabel,
  AdminToolbar,
  adminListClass,
  adminRowLinkClass,
  adminTabsClass,
} from './admin-ui';

const TABS: Array<{ status: QueueStatus; label: string }> = [
  { status: 'pending_review', label: 'Pending' },
  { status: 'edited', label: 'Edited' },
  { status: 'published', label: 'Published' },
  { status: 'suspended', label: 'Suspended' },
];

/** Registrant, municipality, crafts, waiting, arrow — one column on a phone. */
const rowGrid = 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_4.5rem_7rem_1rem]';

function waitingLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'Less than an hour';
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function AdminQueuePage() {
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
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="Review queue"
        description="Oldest registrations first. Open one to approve it, or reject it with a reason the registrant will see."
      />

      <AdminToolbar ruled={false}>
        <Tabs
          label="Queue"
          idPrefix="queue"
          className={adminTabsClass}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          items={TABS.map((tab) => ({
            value: tab.status,
            label: (
              <AdminTabLabel
                text={tab.label}
                count={counts.data?.[tab.status] ?? 0}
                active={status === tab.status}
              />
            ),
          }))}
        />
      </AdminToolbar>

      <div
        id={`queue-panel-${status}`}
        role="tabpanel"
        aria-labelledby={`queue-tab-${status}`}
        className="mt-8"
      >
        {list.isPending && (
          <ul className={adminListClass} aria-label="Loading the queue">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 py-4" aria-hidden="true">
                <Skeleton radius="full" className="size-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {list.isError && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Could not load the queue"
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
          <div>
            {/* Column heads for the desktop grid; a phone reads each row as a
                stack, so the heads would only label nothing there. */}
            <div
              className={`mt-2 hidden gap-x-4 px-2 pb-3 text-xs font-semibold tracking-wider text-ink-subtle uppercase md:grid ${rowGrid}`}
              aria-hidden="true"
            >
              <span>Registrant</span>
              <span>Municipality</span>
              <span>Crafts</span>
              <span>Waiting</span>
              <span />
            </div>
            <ul className={adminListClass}>
              {list.data.data.map((row) => {
                const name = `${row.firstName} ${row.lastName}`;
                const waiting = waitingLabel(
                  status === 'edited' ? (row.editedSinceReviewAt ?? row.createdAt) : row.createdAt,
                );
                return (
                  <li key={row.id} className={adminRowLinkClass}>
                    <div className={`grid items-center gap-x-4 gap-y-1 px-1 py-4 md:px-2 ${rowGrid}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar src={null} name={name} size="md" />
                        <div className="min-w-0">
                          <Link
                            to={`/admin/profiles/${row.id}`}
                            className="font-semibold break-words text-ink after:absolute after:inset-0"
                          >
                            {name}
                          </Link>
                          <p className="text-sm break-words text-ink-muted">@{row.username}</p>
                          {/* The desktop columns, folded into one line on a phone. */}
                          <p className="mt-1 text-sm text-ink-muted md:hidden" data-numeric>
                            {row.municipality} · {row.subdomainCount}{' '}
                            {row.subdomainCount === 1 ? 'craft' : 'crafts'} · waiting {waiting}
                          </p>
                        </div>
                      </div>
                      <p className="hidden text-sm text-ink md:block">{row.municipality}</p>
                      <p className="hidden text-sm text-ink md:block" data-numeric>
                        {row.subdomainCount}
                      </p>
                      <p className="hidden md:block">
                        {status === 'edited' ? (
                          <AdminStatusBadge status="edited" label={waiting} />
                        ) : (
                          <span className="text-sm text-ink" data-numeric>
                            {waiting}
                          </span>
                        )}
                      </p>
                      <ArrowRight
                        className="hidden size-4 text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink md:block"
                        aria-hidden="true"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AdminPagination page={page} pages={totalPages} onPage={setPage} />
      </div>
    </Container>
  );
}
