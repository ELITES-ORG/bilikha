import { useMemo, useState } from 'react';
import { CheckCircle2, Inbox } from 'lucide-react';
import {
  useAdminOrganizationCounts,
  useAdminOrganizations,
  useModerateOrganization,
} from '@/features/organizations/api';
import type { AdminOrganizationRow } from '@/features/organizations/types';
import { Avatar, Button, Container, EmptyState, Skeleton, TabPanels, Tabs, Textarea, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import {
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTabLabel,
  AdminToolbar,
  adminListClass,
  adminTabsClass,
} from './admin-ui';

type OrganizationQueue = 'pending_review' | 'edited' | 'published' | 'rejected' | 'suspended';

const TABS: Array<{ status: OrganizationQueue; label: string }> = [
  { status: 'pending_review', label: 'Pending' },
  { status: 'edited', label: 'Edited' },
  { status: 'published', label: 'Published' },
  { status: 'rejected', label: 'Changes asked' },
  { status: 'suspended', label: 'Suspended' },
];

/**
 * Organisation review (plan 0051 phase 4). The same decisions as a profile's
 * review — approve, reject with a reason the founder sees, acknowledge a
 * published edit — on the rows themselves: an organisation page is a name, a
 * bio and a list of crafts, so everything the decision needs fits in the row
 * and there is no detail page to open. English only, like every admin screen.
 */
export function AdminOrganizationsPage() {
  const [status, setStatus] = useState<OrganizationQueue>('pending_review');
  const [page, setPage] = useState(1);
  const counts = useAdminOrganizationCounts();
  const list = useAdminOrganizations(status, page);

  const totalPages = useMemo(() => {
    const total = list.data?.meta.total ?? 0;
    const limit = list.data?.meta.limit ?? 20;
    return Math.max(1, Math.ceil(total / limit));
  }, [list.data]);

  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="Organisations"
        description="Oldest first. An organisation's name is easier to impersonate than a person's, so every new page is checked before it is public."
      />

      <AdminToolbar ruled={false}>
        <Tabs
          label="Organisation queue"
          idPrefix="organizations"
          className={adminTabsClass}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          items={TABS.map((tab) => ({
            value: tab.status,
            label: (
              <AdminTabLabel text={tab.label} count={counts.data?.[tab.status] ?? 0} active={status === tab.status} />
            ),
          }))}
        />
      </AdminToolbar>

      <TabPanels idPrefix="organizations" values={TABS.map((tab) => tab.status)} value={status} className="mt-8">
        {list.isPending && (
          <ul className={adminListClass} aria-label="Loading organisations">
            {Array.from({ length: 3 }).map((_, i) => (
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
            title="Could not load organisations"
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
            title={status === 'edited' ? 'No published edits waiting' : 'Nothing here'}
            description={
              status === 'pending_review'
                ? 'Every organisation has been decided.'
                : 'Organisations in this state will appear here.'
            }
          />
        )}

        {list.data && list.data.data.length > 0 && (
          <ul className={adminListClass}>
            {list.data.data.map((row) => (
              <OrganizationRow key={row.id} row={row} queue={status} />
            ))}
          </ul>
        )}

        <AdminPagination page={page} pages={totalPages} onPage={setPage} />
      </TabPanels>
    </Container>
  );
}

function OrganizationRow({ row, queue }: { row: AdminOrganizationRow; queue: OrganizationQueue }) {
  const toast = useToast();
  const moderate = useModerateOrganization();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const decidable = queue === 'pending_review' || queue === 'edited';

  async function decide(action: 'approved' | 'rejected' | 'acknowledged_edit') {
    const pending = { approved: 'Approving…', rejected: 'Sending back…', acknowledged_edit: 'Acknowledging…' }[action];
    const success = {
      approved: `${row.name} is public`,
      rejected: 'Sent back to the founder with your reason',
      acknowledged_edit: 'Edit acknowledged',
    }[action];
    try {
      await toast.run(
        pending,
        () => moderate.mutateAsync({ id: row.id, action, reason: action === 'rejected' ? reason : undefined }),
        { success, error: (error) => toApiError(error).message },
      );
      setRejecting(false);
      setReason('');
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <li className="space-y-4 px-1 py-5 md:px-2">
      <div className="flex items-start gap-3">
        <Avatar src={null} name={row.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold break-words text-ink">{row.name}</p>
            {row.editedSinceReviewAt && <AdminStatusBadge status="edited" />}
          </div>
          <p className="mt-0.5 text-sm break-words text-ink-muted" data-numeric>
            {row.founderUsername ? `Founded by @${row.founderUsername}` : 'No founder'} · {row.municipality} ·{' '}
            {row.memberCount} {row.memberCount === 1 ? 'member' : 'members'}
          </p>
          {row.crafts.length > 0 && <p className="mt-1 text-sm text-ink">{row.crafts.join(' · ')}</p>}
          {row.bio ? (
            <p className="mt-3 max-w-prose text-sm whitespace-pre-line text-ink-muted">{row.bio}</p>
          ) : (
            <p className="mt-3 text-sm text-ink-subtle">No description.</p>
          )}
        </div>
      </div>

      {decidable &&
        (rejecting ? (
          <div className="max-w-xl space-y-3">
            <Textarea
              label="What needs changing"
              hint="The founder sees this exactly as written."
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="danger"
                disabled={!reason.trim() || moderate.isPending}
                onClick={() => void decide('rejected')}
              >
                Send back
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {queue === 'pending_review' ? (
              <Button size="sm" disabled={moderate.isPending} onClick={() => void decide('approved')}>
                Approve
              </Button>
            ) : (
              <Button size="sm" disabled={moderate.isPending} onClick={() => void decide('acknowledged_edit')}>
                Acknowledge edit
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
              Ask for changes
            </Button>
          </div>
        ))}
    </li>
  );
}
