import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Badge, Button, Container, EmptyState, Input, SectionHeading, Skeleton } from '@/components/ui';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import {
  useMarkInquiryRead,
  useReceivedInquiries,
  useRespondToInquiry,
} from '@/features/inquiries/api';
import type { ReceivedInquiry } from '@/features/inquiries/types';
import { toApiError } from '@/lib/api-client';

function ageLabel(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function InboxInner() {
  const { data: user } = useCurrentUser();
  const [page, setPage] = useState(1);
  const list = useReceivedInquiries(page, Boolean(user?.profileSlug));
  const markRead = useMarkInquiryRead();
  const respond = useRespondToInquiry();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = useMemo(
    () => list.data?.data.find((row) => row.id === openId) ?? null,
    [list.data, openId],
  );

  if (!user?.profileSlug) {
    return <Navigate to="/directory" replace />;
  }

  async function openInquiry(row: ReceivedInquiry) {
    setOpenId(row.id);
    setReply('');
    setError(null);
    if (row.status === 'sent') {
      try {
        await markRead.mutateAsync(row.id);
      } catch {
        // Non-fatal — still show the message.
      }
    }
  }

  async function onRespond(action: 'responded' | 'declined') {
    if (!open) return;
    setError(null);
    if (action === 'responded' && !reply.trim()) {
      setError('Write a response before sending.');
      return;
    }
    try {
      await respond.mutateAsync({
        id: open.id,
        action,
        response: reply.trim() || undefined,
      });
      setOpenId(null);
      setReply('');
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <SectionHeading
            eyebrow="Creative"
            title="Inbox"
            description="Inquiries sent to your published profile. There are no email alerts — check here."
          />

          <div className="mt-10">
            {list.isPending && <Skeleton className="h-40 w-full" />}

            {list.data && list.data.data.length === 0 && (
              <EmptyState
                title="No inquiries yet"
                description="When someone contacts you from your public profile, it will appear here."
              />
            )}

            {list.data && list.data.data.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {list.data.data.map((row) => {
                  const unread = row.status === 'sent';
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => void openInquiry(row)}
                        className={`flex w-full flex-col gap-1 py-5 text-left transition-colors hover:bg-clay-50/60 ${
                          unread ? 'font-medium' : ''
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-ink">{row.sender.fullName}</span>
                          <span className="text-xs text-ink-subtle tabular-nums">
                            {ageLabel(row.createdAt)}
                          </span>
                        </div>
                        <span className="text-sm text-ink-muted">{row.subject}</span>
                        <Badge tone={unread ? 'accent' : 'neutral'} className="mt-1 w-fit">
                          {row.status}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {list.data && totalPages > 1 && (
              <div className="mt-8 flex justify-between">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          {open && (
            <div className="mt-10 rounded-sm border border-hairline bg-surface p-6">
              <p className="text-sm text-ink-subtle">From {open.sender.fullName}</p>
              <h2 className="u-display mt-2 text-2xl">{open.subject}</h2>
              <p className="mt-4 whitespace-pre-wrap text-base text-ink">{open.message}</p>

              {open.status === 'responded' || open.status === 'declined' ? (
                <p className="mt-6 text-sm text-ink-muted">
                  You already {open.status} this inquiry
                  {open.response ? `: “${open.response}”` : '.'}
                </p>
              ) : (
                <div className="mt-6 grid gap-4">
                  {error && <p className="text-sm text-danger-700">{error}</p>}
                  <Input
                    label="Your response"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    hint="Required to accept; optional when declining."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button loading={respond.isPending} onClick={() => void onRespond('responded')}>
                      Respond
                    </Button>
                    <Button
                      variant="secondary"
                      loading={respond.isPending}
                      onClick={() => void onRespond('declined')}
                    >
                      Decline
                    </Button>
                    <Button variant="ghost" onClick={() => setOpenId(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Container>
      </main>
    </>
  );
}

export function InboxPage() {
  return (
    <RequireAuth>
      <InboxInner />
    </RequireAuth>
  );
}
