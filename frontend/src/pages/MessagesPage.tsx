import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { ModeNotice } from '@/components/ModeNotice';
import { effectiveViewMode, MODE_LABEL } from '@/lib/view-mode';
import { ModeAwareEmptyState } from '@/components/ModeAwareEmptyState';
import { Avatar, Button, ButtonLink, Badge, Container, SectionHeading, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useConversationThreads } from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { Link } from 'react-router-dom';
import { pbBottomNav } from '@/lib/bottom-nav';

export function MessagesPage() {
  const [page, setPage] = useState(1);
  const { data: user } = useCurrentUser();
  const mode = effectiveViewMode(user);
  const list = useConversationThreads(mode, page);

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;

  const emptyDescription =
    mode === 'hiring'
      ? `You are viewing “${MODE_LABEL.hiring}”. No conversations yet — contact a creative from the directory, or switch to “${MODE_LABEL.creative}” to reply to client postings.`
      : `You are viewing “${MODE_LABEL.creative}”. No conversations yet — browse client postings on Home, or switch to “${MODE_LABEL.hiring}” to reach creatives.`;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Messages"
            title="Conversations"
            description="Threads with creatives and clients. Nothing is sent by email or SMS, so new messages land here and the tab carries the count."
          />

          <div className="mt-6">
            <ModeNotice />
          </div>

          <div className="mt-10">
            {list.isPending && <Skeleton className="h-40 w-full" />}

            {list.isError && (
              <p className="text-danger-700">{list.error.message}</p>
            )}

            {list.data && list.data.data.length === 0 && (
              <ModeAwareEmptyState
                title="No conversations yet"
                description={emptyDescription}
                extraAction={
                  <ButtonLink to="/directory" size="sm" variant="secondary">
                    Go to Home
                  </ButtonLink>
                }
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border border-hairline">
                {list.data.data.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/messages/${row.id}`}
                      className="flex items-start justify-between gap-4 px-4 py-4 transition-colors hover:bg-clay-50"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar
                          src={row.otherPartyAvatarUrl}
                          name={row.otherPartyName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{row.otherPartyName}</span>
                            {row.unreadCount > 0 && (
                              <Badge tone="accent" className="tabular-nums">
                                {row.unreadCount}
                              </Badge>
                            )}
                          </div>
                          {row.lastMessage && (
                            <p className="mt-1 truncate text-sm text-ink-muted">
                              {row.lastMessage.fromSelf ? 'You: ' : ''}
                              {row.lastMessage.body}
                            </p>
                          )}
                        </div>
                      </div>
                      <time
                        className="shrink-0 text-xs text-ink-subtle tabular-nums"
                        dateTime={row.lastMessageAt}
                      >
                        {relativeTime(row.lastMessageAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {list.data && totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
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
        </Container>
      </main>
    </>
  );
}
