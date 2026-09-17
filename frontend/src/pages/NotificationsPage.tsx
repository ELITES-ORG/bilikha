import { Link } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Avatar,
  Button,
  Container,
  EmptyState,
  SectionHeading,
  Skeleton,
  useToast,
} from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/notifications/api';
import type { AppNotification } from '@/features/notifications/types';
import { relativeTime } from '@/features/conversations/relative-time';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function Row({
  row,
  onOpen,
}: {
  row: AppNotification;
  onOpen: (row: AppNotification) => void;
}) {
  const unread = !row.readAt;

  const body = (
    <div className="flex items-start gap-3">
      {row.actor ? (
        <Avatar src={row.actor.avatarUrl} name={row.actor.name} size="sm" />
      ) : (
        <span className="size-9 shrink-0 rounded-full bg-hairline" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', unread ? 'font-medium text-ink' : 'text-ink-muted')}>
          {row.title}
        </p>
        {row.detail && <p className="mt-0.5 text-sm text-ink-subtle">{row.detail}</p>}
        <p className="mt-1 text-2xs text-ink-subtle">{relativeTime(row.createdAt)}</p>
      </div>
      {unread && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-lawa-600"
          aria-label="Unread"
        />
      )}
    </div>
  );

  // A tombstone is not a link. It still marks read on tap, so it can be
  // cleared rather than sitting unread forever.
  if (!row.link) {
    return (
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="w-full rounded-lg px-3 py-3 text-left opacity-60 transition-colors hover:bg-clay-50"
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      to={row.link}
      onClick={() => onOpen(row)}
      className="block rounded-lg px-3 py-3 transition-colors hover:bg-clay-50"
    >
      {body}
    </Link>
  );
}

export function NotificationsPage() {
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const toast = useToast();

  const rows = notifications.data ?? [];
  const hasUnread = rows.some((row) => !row.readAt);

  function onOpen(row: AppNotification) {
    if (!row.readAt) markRead.mutate(row.id);
  }

  async function onMarkAll() {
    await toast.run('Marking all as read…', () => markAll.mutateAsync(), {
      success: 'All caught up',
      error: (error) => toApiError(error).message,
    });
  }

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Notifications"
            title="What happened"
            description="Decisions on your profile, and replies to your postings. New messages show on the Messages tab."
            action={
              hasUnread ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={markAll.isPending}
                  onClick={() => void onMarkAll()}
                >
                  Mark all as read
                </Button>
              ) : undefined
            }
          />

          {notifications.isPending && (
            <div className="mt-8 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {notifications.isError && (
            <div className="mt-8">
              <EmptyState
                title="Could not load notifications"
                description={notifications.error.message}
              />
            </div>
          )}

          {notifications.data && rows.length === 0 && (
            <div className="mt-8">
              <EmptyState
                title="Nothing yet"
                description="When an administrator reviews your creative profile, or a creative replies to something you posted, it shows up here."
              />
            </div>
          )}

          {rows.length > 0 && (
            <ul className="mt-8 divide-y divide-hairline">
              {rows.map((row) => (
                <li key={row.id}>
                  <Row row={row} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </main>
    </div>
  );
}
