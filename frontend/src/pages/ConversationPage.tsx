import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Button, Container, Input, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import {
  useBlockUser,
  useConversationThread,
  useMarkConversationRead,
  useReportConversation,
  useSendMessage,
} from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type MenuMode = 'closed' | 'menu' | 'report' | 'block';

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const thread = useConversationThread(id, true);
  const markRead = useMarkConversationRead();
  const send = useSendMessage(id ?? '');
  const report = useReportConversation(id ?? '');
  const block = useBlockUser();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blockConfirmed, setBlockConfirmed] = useState(false);
  const [menu, setMenu] = useState<MenuMode>('closed');
  const [reportReason, setReportReason] = useState('');
  const [reportDone, setReportDone] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const markedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !thread.data || markedFor.current === id) return;
    markedFor.current = id;
    void markRead.mutateAsync(id).catch(() => {
      markedFor.current = null;
    });
  }, [id, thread.data, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.data?.messages.length]);

  async function onReply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text) {
      setError('Write a message');
      return;
    }
    try {
      await send.mutateAsync(text);
      setBody('');
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.message);
      if (apiError.message.toLowerCase().includes('cannot be delivered')) {
        setBlocked(true);
      }
    }
  }

  async function onReport(e: FormEvent) {
    e.preventDefault();
    setSafetyError(null);
    try {
      await report.mutateAsync(reportReason.trim());
      setReportDone(true);
      setMenu('closed');
      setReportReason('');
    } catch (err) {
      setSafetyError(toApiError(err).message);
    }
  }

  async function onBlockConfirm() {
    if (!thread.data) return;
    setSafetyError(null);
    try {
      await block.mutateAsync(thread.data.otherPartyUserId);
      setMenu('closed');
      setBlockConfirmed(true);
    } catch (err) {
      setSafetyError(toApiError(err).message);
    }
  }

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />
      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="text-sm">
            <Link to="/messages" className="link-underline text-ink-muted">
              ← Messages
            </Link>
          </p>

          {thread.isPending && (
            <div className="mt-8 space-y-3">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {thread.isError && (
            <p className="mt-8 text-danger-700">{thread.error.message}</p>
          )}

          {thread.data && (
            <>
              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <h1 className="u-display text-3xl text-ink">{thread.data.subject}</h1>
                  <p className="mt-1 text-sm text-ink-muted">With {thread.data.otherPartyName}</p>
                </div>
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={menu !== 'closed'}
                    aria-haspopup="menu"
                    onClick={() => setMenu((m) => (m === 'closed' ? 'menu' : 'closed'))}
                  >
                    More
                  </Button>
                  {menu === 'menu' && (
                    <div
                      role="menu"
                      className="absolute right-0 z-10 mt-1 w-52 rounded-sm border border-hairline bg-surface py-1 shadow-sm"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
                        onClick={() => {
                          setReportDone(false);
                          setMenu('report');
                        }}
                      >
                        Report conversation
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-sm text-danger-700 hover:bg-clay-50"
                        onClick={() => setMenu('block')}
                      >
                        Block this person
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {reportDone && (
                <p className="mt-4 rounded-sm border border-hairline bg-clay-50 px-3 py-2 text-sm text-ink-muted">
                  Report received. An administrator will review it.
                </p>
              )}

              {blockConfirmed && !blocked && (
                <p className="mt-4 rounded-sm border border-hairline bg-clay-50 px-3 py-2 text-sm text-ink-muted">
                  {thread.data.otherPartyName} can no longer message you. You can still write to
                  them.
                </p>
              )}

              {menu === 'report' && (
                <form
                  onSubmit={(e) => void onReport(e)}
                  className="mt-4 rounded-sm border border-hairline bg-surface p-4"
                >
                  <p className="text-sm font-medium text-ink">Report this conversation</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Tell us what is wrong. Reports are reviewed by an administrator.
                  </p>
                  {safetyError && <p className="mt-2 text-sm text-danger-700">{safetyError}</p>}
                  <div className="mt-3">
                    <Input
                      label="Reason"
                      required
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      maxLength={500}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="submit" size="sm" loading={report.isPending}>
                      Submit report
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setMenu('closed')}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {menu === 'block' && (
                <div className="mt-4 rounded-sm border border-hairline bg-surface p-4">
                  <p className="text-sm font-medium text-ink">
                    Block {thread.data.otherPartyName}?
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    They will not be able to start or continue a conversation with you. You can
                    still message them if you choose.
                  </p>
                  {safetyError && <p className="mt-2 text-sm text-danger-700">{safetyError}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={block.isPending}
                      onClick={() => void onBlockConfirm()}
                    >
                      Block
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setMenu('closed')}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-8 space-y-3">
                {thread.data.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[85%] rounded-sm px-3 py-2 text-base',
                      msg.fromSelf
                        ? 'ml-auto bg-lawa-700 text-clay-50'
                        : 'mr-auto border border-hairline bg-surface text-ink',
                    )}
                  >
                    <p className="whitespace-pre-wrap text-pretty">{msg.body}</p>
                    <p
                      className={cn(
                        'mt-1 text-2xs tabular-nums',
                        msg.fromSelf ? 'text-clay-100/80' : 'text-ink-subtle',
                      )}
                    >
                      {relativeTime(msg.createdAt)}
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {blocked ? (
                <div className="mt-8 border-t border-hairline pt-6">
                  <p className="text-base text-ink-muted text-pretty">
                    Messaging with this person is stopped. Further messages cannot be delivered.
                  </p>
                </div>
              ) : (
                <form onSubmit={(e) => void onReply(e)} className="mt-8 border-t border-hairline pt-6">
                  {error && <p className="mb-3 text-sm text-danger-700">{error}</p>}
                  <label htmlFor="reply-body" className="sr-only">
                    Reply
                  </label>
                  <textarea
                    id="reply-body"
                    rows={3}
                    maxLength={2000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a reply"
                    className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button type="submit" loading={send.isPending}>
                      Send
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </Container>
      </main>
    </>
  );
}
