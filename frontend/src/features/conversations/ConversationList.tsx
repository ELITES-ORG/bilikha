import { useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { ModeAwareEmptyState } from '@/components/ModeAwareEmptyState';
import { ModeNotice } from '@/components/ModeNotice';
import { Avatar, Badge, Button, ButtonLink, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { useConversationThreads } from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { cn } from '@/lib/cn';
import { effectiveViewMode } from '@/lib/view-mode';

/**
 * The inbox: every conversation, newest first, paginated. It is the whole
 * screen at /messages on a phone, and the left pane of the split view from lg,
 * where it stays mounted while threads change on the right.
 */
export function ConversationList() {
  const [page, setPage] = useState(1);
  const { data: user } = useCurrentUser();
  const mode = effectiveViewMode(user);
  const list = useConversationThreads(mode, page);
  const openThread = useMatch('/messages/:id')?.params.id;
  // With a thread open the thread's name is the page's h1; the inbox steps down.
  const Heading = openThread ? 'h2' : 'h1';

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;

  const emptyDescription =
    mode === 'hiring'
      ? 'No conversations yet — contact a creative from the directory.'
      : 'No conversations yet — browse client postings on Home.';
  const emptyDescriptionWithoutProfile =
    'No conversations yet — contact a creative from the directory.';

  return (
    <div>
      <div className="lg:border-b lg:border-hairline lg:px-5 lg:py-4">
        <Heading className="u-display text-3xl text-ink lg:text-2xl">Messages</Heading>
        <p className="mt-2 max-w-xl text-sm text-ink-muted lg:hidden">
          Threads with creatives and clients. Nothing is sent by email or SMS, so new messages
          land here and the tab carries the count.
        </p>
      </div>

      <div className="mt-5 lg:mt-0 lg:px-4 lg:pt-3 empty:hidden">
        <ModeNotice />
      </div>

      <div className="mt-6 lg:mt-0">
        {list.isPending && (
          <ul className="divide-y divide-hairline" aria-label="Loading conversations">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3.5 px-4 py-4 sm:px-5">
                <Skeleton radius="full" className="size-12 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {list.isError && (
          <p className="px-4 text-danger-700" role="alert">
            {list.error.message}
          </p>
        )}

        {list.data && list.data.data.length === 0 && (
          <div className="lg:p-4">
            <ModeAwareEmptyState
              title="No conversations yet"
              description={emptyDescription}
              descriptionWithoutProfile={emptyDescriptionWithoutProfile}
              extraAction={
                <ButtonLink to="/directory" size="sm" variant="secondary">
                  Go to Home
                </ButtonLink>
              }
            />
          </div>
        )}

        {list.data && list.data.data.length > 0 && (
          <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-surface shadow-xs lg:rounded-none lg:border-0 lg:shadow-none">
            {list.data.data.map((row) => {
              const unread = row.unreadCount > 0;
              const active = row.id === openThread;
              return (
                <li key={row.id}>
                  <Link
                    to={`/messages/${row.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-16 items-center gap-3.5 px-4 py-4 transition-colors sm:px-5',
                      active
                        ? 'bg-primary-soft before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-lawa-700'
                        : 'hover:bg-clay-50',
                    )}
                  >
                    <Avatar src={row.otherPartyAvatarUrl} name={row.otherPartyName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-ink', unread ? 'font-bold' : 'font-semibold')}>
                        {row.otherPartyName}
                      </p>
                      {row.lastMessage && (
                        <p
                          className={cn(
                            'mt-0.5 truncate text-sm',
                            unread ? 'font-medium text-ink' : 'text-ink-muted',
                          )}
                        >
                          {row.lastMessage.fromSelf ? 'You: ' : ''}
                          {row.lastMessage.body}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
                      <time className="text-xs text-ink-subtle tabular-nums" dateTime={row.lastMessageAt}>
                        {relativeTime(row.lastMessageAt)}
                      </time>
                      {unread && (
                        <Badge
                          tone="accent"
                          variant="solid"
                          className="min-w-5 justify-center px-1.5 tabular-nums"
                          aria-label={`${row.unreadCount} unread`}
                        >
                          {row.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {list.data && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between lg:mt-0 lg:border-t lg:border-hairline lg:px-4 lg:py-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-ink-muted tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
