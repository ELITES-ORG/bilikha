import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Inbox, MapPin } from 'lucide-react';
import type { AdminIdVerificationRow } from '@contracts/verification';
import { Badge, Button, EmptyState, Skeleton, TabPanels, Tabs } from '@/components/ui';
import { useAdminIdQueue, useAdminSummary, type IdQueueView } from '@/features/admin/api';
import { idTypeOption } from '@/features/verification/id-types';
import {
  AdminPagination,
  AdminStatusBadge,
  AdminTabLabel,
  AdminToolbar,
  adminListClass,
  adminRowLinkClass,
  adminTabsClass,
} from './admin-ui';
import { formatAdminDate } from './admin-format';

type View = IdQueueView;

const TABS: { view: View; label: string }[] = [
  { view: 'pending', label: 'Waiting' },
  { view: 'appeals', label: 'Appeals' },
  { view: 'decided', label: 'Decided' },
];

const EMPTY: Record<View, { title: string; description: string }> = {
  pending: { title: 'No IDs waiting', description: 'Every submitted ID has a decision.' },
  appeals: {
    title: 'No appeals waiting',
    description: 'A person declined as not from Biliran can appeal once, within 7 days, from the sign-in screen.',
  },
  decided: {
    title: 'Nothing decided this week',
    description: 'IDs decided in the last 7 days appear here, while a decision can still be changed.',
  },
};

/**
 * New accounts' IDs waiting for a decision (ADR 0057), oldest first — there is
 * no deadline for a review, so nobody should wait longest. Appeals, oldest
 * first too, are a person's one challenge to a *not from Biliran* decline.
 * Decided shows the last 7 days, while a decision can still be changed. Part of
 * People (ADR 0059): an ID check asks who someone is. English only, like every
 * admin screen.
 */
export function IdCheckQueue() {
  const [view, setView] = useState<View>('pending');
  const [page, setPage] = useState(1);
  const queue = useAdminIdQueue(view, page);
  // The waiting tabs show their counts from the summary, so an appeal is seen
  // from the Waiting tab; Decided counts only once it is open.
  const summary = useAdminSummary();
  const counts: Record<View, number | undefined> = {
    pending: summary.data?.people.ids,
    appeals: summary.data?.people.appeals,
    decided: view === 'decided' ? queue.data?.meta.total : undefined,
  };

  const pages = useMemo(() => {
    const total = queue.data?.meta.total ?? 0;
    const limit = queue.data?.meta.limit ?? 20;
    return Math.max(1, Math.ceil(total / limit));
  }, [queue.data]);

  return (
    <>
      <AdminToolbar ruled={false}>
        <Tabs
          label="ID checks"
          idPrefix="admin-ids"
          className={adminTabsClass}
          value={view}
          onChange={(next) => {
            setView(next);
            setPage(1);
          }}
          items={TABS.map((tab) => ({
            value: tab.view,
            label: (
              <AdminTabLabel
                text={tab.label}
                count={counts[tab.view]}
                active={view === tab.view}
              />
            ),
          }))}
        />
      </AdminToolbar>

      <TabPanels idPrefix="admin-ids" values={TABS.map((tab) => tab.view)} value={view} className="mt-6">
        {queue.isPending && (
          <ul className={adminListClass} aria-label="Loading IDs">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="space-y-2 py-4" aria-hidden="true">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-40" />
              </li>
            ))}
          </ul>
        )}

        {queue.isError && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Could not load the IDs"
            description={queue.error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => void queue.refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {queue.data && queue.data.data.length === 0 && (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title={EMPTY[view].title}
            description={EMPTY[view].description}
          />
        )}

        {queue.data && queue.data.data.length > 0 && (
          <ul className={adminListClass}>
            {queue.data.data.map((row) => (
              <IdRow key={row.id} row={row} />
            ))}
          </ul>
        )}

        <AdminPagination page={page} pages={pages} onPage={setPage} />
      </TabPanels>
    </>
  );
}

function IdRow({ row }: { row: AdminIdVerificationRow }) {
  const label = idTypeOption(row.idType)?.label ?? 'ID type not given';
  const when = (row.status === 'appealed' ? row.appealedAt : null) ?? row.decidedAt ?? row.submittedAt;
  return (
    <li className={adminRowLinkClass}>
      <Link
        to={`/admin/people/ids/${row.id}`}
        className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words text-ink">{row.fullName}</p>
            <span className="text-sm text-ink-muted">@{row.username}</span>
            {row.accountSuspended && <AdminStatusBadge status="suspended" />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span>{label}</span>
            {row.municipality && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {row.municipality}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <AdminStatusBadge status={row.status === 'pending' ? 'pending_review' : row.status} />
          {when && (
            <Badge tone="neutral">
              <time dateTime={when}>{formatAdminDate(when)}</time>
            </Badge>
          )}
          <ArrowRight
            className="size-4 text-ink-subtle transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}
