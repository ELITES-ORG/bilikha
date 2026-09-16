import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Button, Container, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import {
  useConversationThread,
  useMarkConversationRead,
  useSendMessage,
} from '@/features/conversations/api';
import { relativeTime } from '@/features/conversations/relative-time';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const thread = useConversationThread(id, true);
  const markRead = useMarkConversationRead();
  const send = useSendMessage(id ?? '');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      setError(toApiError(err).message);
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
              <h1 className="u-display mt-4 text-3xl text-ink">{thread.data.subject}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                With {thread.data.otherPartyName}
              </p>

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
            </>
          )}
        </Container>
      </main>
    </>
  );
}
