import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, EllipsisVertical } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Button, Container, Input, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import {
  useBlockUser,
  useConversationThread,
  useMarkConversationRead,
  useReportConversation,
  useSendMessage,
} from '@/features/conversations/api';
import {
  OfferCard,
  OfferUnavailableNotice,
  MessageOfferBlock,
} from '@/features/conversations/OfferCard';
import {
  PostingCard,
  PostingUnavailableNotice,
  MessagePostingBlock,
} from '@/features/conversations/PostingCard';
import { relativeTime } from '@/features/conversations/relative-time';
import { OfferNotFoundError, usePublishedOffer } from '@/features/offers/api';
import { PostingNotFoundError, usePosting } from '@/features/postings/api';
import { toApiError } from '@/lib/api-client';
import { pbBottomNav, pbConversationComposer, fixedComposerAboveNav } from '@/lib/bottom-nav';
import { cn } from '@/lib/cn';

type MenuMode = 'closed' | 'menu' | 'report' | 'block';

function ConversationMenu({
  open,
  onToggle,
  onReport,
  onBlock,
}: {
  open: boolean;
  onToggle: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-sm text-ink-muted hover:bg-clay-100 hover:text-ink"
        aria-label="Conversation options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        <EllipsisVertical className="size-5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-52 rounded-sm border border-hairline bg-surface py-1 shadow-sm"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
            onClick={onReport}
          >
            Report conversation
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-danger-700 hover:bg-clay-50"
            onClick={onBlock}
          >
            Block this person
          </button>
        </div>
      )}
    </div>
  );
}

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const attachedOfferId = searchParams.get('offerId');
  const attachedPostingId = searchParams.get('postingId');
  const attachedOffer = usePublishedOffer(attachedOfferId ?? undefined);
  const attachedPosting = usePosting(attachedPostingId ?? undefined);

  const thread = useConversationThread(id, true);
  const markRead = useMarkConversationRead();
  const send = useSendMessage(id ?? '');
  const report = useReportConversation(id ?? '');
  const block = useBlockUser();
  const bottomRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
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

  function clearAttachedOffer() {
    const next = new URLSearchParams(searchParams);
    next.delete('offerId');
    setSearchParams(next, { replace: true });
  }

  function clearAttachedPosting() {
    const next = new URLSearchParams(searchParams);
    next.delete('postingId');
    setSearchParams(next, { replace: true });
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const text = body.trim();
    if (!text) {
      setError('Write a message');
      return;
    }
    // Only attach when the offer still resolves; a deleted offer stays detachable
    // in the UI but must not be posted.
    const offerIdToSend =
      attachedOfferId && attachedOffer.data ? attachedOfferId : undefined;
    const postingIdToSend =
      attachedPostingId && attachedPosting.data ? attachedPostingId : undefined;
    try {
      await send.mutateAsync({
        body: text,
        ...(offerIdToSend ? { offerId: offerIdToSend } : {}),
        ...(postingIdToSend ? { postingId: postingIdToSend } : {}),
      });
      setBody('');
      if (replyRef.current) replyRef.current.style.height = '';
      if (attachedOfferId) clearAttachedOffer();
      if (attachedPostingId) clearAttachedPosting();
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

  const attachmentUnavailable =
    Boolean(attachedOfferId) &&
    attachedOffer.isError &&
    attachedOffer.error instanceof OfferNotFoundError;

  const postingAttachmentUnavailable =
    Boolean(attachedPostingId) &&
    attachedPosting.isError &&
    attachedPosting.error instanceof PostingNotFoundError;

  const partyName = thread.data?.otherPartyName;
  const partyAvatar = thread.data?.otherPartyAvatarUrl;

  return (
    <>
      {/* Desktop keeps the site header; phones use the conversation chrome below. */}
      <div className="hidden sm:block">
        <SiteHeader />
      </div>
      <RegistrationStatusBanner />

      {/* Phone chat header: back + avatar + name | ⋮ */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-hairline bg-paper/90 px-1 backdrop-blur-sm sm:hidden">
        <Link
          to="/messages"
          aria-label="Back to messages"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-ink hover:bg-clay-100"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        {thread.data ? (
          <>
            <Avatar src={partyAvatar} name={partyName!} size="sm" />
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
              {partyName}
            </h1>
            <ConversationMenu
              open={menu === 'menu'}
              onToggle={() => setMenu((m) => (m === 'closed' ? 'menu' : 'closed'))}
              onReport={() => {
                setReportDone(false);
                setMenu('report');
              }}
              onBlock={() => setMenu('block')}
            />
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        )}
      </header>

      <main className={thread.data && !blocked ? pbConversationComposer : pbBottomNav}>
        <Container width="narrow" className="max-sm:py-4 py-(--section-gap)">
          {/* Desktop back + party row */}
          <div className="mb-4 hidden items-center justify-between gap-4 sm:flex">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/messages"
                aria-label="Back to messages"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-clay-100 hover:text-ink"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
              {thread.data ? (
                <>
                  <Avatar src={partyAvatar} name={partyName!} size="md" />
                  <h1 className="u-display truncate text-3xl text-ink">{partyName}</h1>
                </>
              ) : (
                <>
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <Skeleton className="h-8 w-40" />
                </>
              )}
            </div>
            {thread.data && (
              <ConversationMenu
                open={menu === 'menu'}
                onToggle={() => setMenu((m) => (m === 'closed' ? 'menu' : 'closed'))}
                onReport={() => {
                  setReportDone(false);
                  setMenu('report');
                }}
                onBlock={() => setMenu('block')}
              />
            )}
          </div>

          {thread.isPending && (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {thread.isError && (
            <p className="text-danger-700">{thread.error.message}</p>
          )}

          {thread.data && (
            <>
              {reportDone && (
                <p className="mb-4 rounded-sm border border-hairline bg-clay-50 px-3 py-2 text-sm text-ink-muted">
                  Report received. An administrator will review it.
                </p>
              )}

              {blockConfirmed && !blocked && (
                <p className="mb-4 rounded-sm border border-hairline bg-clay-50 px-3 py-2 text-sm text-ink-muted">
                  {thread.data.otherPartyName} can no longer message you. You can still write to
                  them.
                </p>
              )}

              {menu === 'report' && (
                <form
                  onSubmit={(e) => void onReport(e)}
                  className="mb-4 rounded-sm border border-hairline bg-surface p-4"
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
                <div className="mb-4 rounded-sm border border-hairline bg-surface p-4">
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

              <div className="space-y-3">
                {thread.data.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[85%] rounded-sm px-3 py-2 text-base',
                      msg.fromSelf
                        ? 'ml-auto bg-primary text-on-primary'
                        : 'mr-auto border border-hairline bg-surface text-ink',
                    )}
                  >
                    <MessageOfferBlock
                      offer={msg.offer ?? null}
                      offerRemoved={msg.offerRemoved}
                      fromSelf={msg.fromSelf}
                    />
                    <MessagePostingBlock
                      posting={msg.posting ?? null}
                      postingRemoved={msg.postingRemoved}
                      fromSelf={msg.fromSelf}
                    />
                    <p className="whitespace-pre-wrap text-pretty">{msg.body}</p>
                    <p
                      className={cn(
                        'mt-1 text-2xs tabular-nums',
                        msg.fromSelf ? 'text-on-primary-muted' : 'text-ink-subtle',
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
                <form
                  onSubmit={(e) => void onReply(e)}
                  className={fixedComposerAboveNav}
                >
                  {(attachedOfferId || attachedPostingId) && (
                    <div className="mb-2 max-sm:max-h-28 max-sm:overflow-y-auto">
                      {attachedOfferId && attachedOffer.isPending && (
                        <Skeleton className="h-14 w-full" />
                      )}
                      {attachedPostingId && attachedPosting.isPending && (
                        <Skeleton className="h-14 w-full" />
                      )}
                      {attachmentUnavailable && (
                        <div className="flex items-start justify-between gap-3 rounded-sm border border-hairline bg-clay-50 px-3 py-2">
                          <OfferUnavailableNotice />
                          <button
                            type="button"
                            className="shrink-0 text-sm text-ink-muted hover:text-ink"
                            onClick={clearAttachedOffer}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      {postingAttachmentUnavailable && (
                        <div className="flex items-start justify-between gap-3 rounded-sm border border-hairline bg-clay-50 px-3 py-2">
                          <PostingUnavailableNotice />
                          <button
                            type="button"
                            className="shrink-0 text-sm text-ink-muted hover:text-ink"
                            onClick={clearAttachedPosting}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      {attachedOffer.data && (
                        <OfferCard
                          offer={{
                            id: attachedOffer.data.id,
                            title: attachedOffer.data.title,
                            priceMinCentavos: attachedOffer.data.priceMinCentavos,
                            priceMaxCentavos: attachedOffer.data.priceMaxCentavos,
                            image: attachedOffer.data.images[0]
                              ? {
                                  url: attachedOffer.data.images[0].url,
                                  thumbUrl: attachedOffer.data.images[0].thumbUrl,
                                }
                              : null,
                          }}
                          footer={
                            <div className="border-t border-hairline px-2 py-1.5">
                              <button
                                type="button"
                                className="text-xs text-ink-muted hover:text-ink"
                                onClick={clearAttachedOffer}
                              >
                                Remove offer
                              </button>
                            </div>
                          }
                        />
                      )}
                      {attachedPosting.data && (
                        <PostingCard
                          posting={{
                            id: attachedPosting.data.id,
                            title: attachedPosting.data.title,
                            budgetMinCentavos: attachedPosting.data.budgetMinCentavos,
                            budgetMaxCentavos: attachedPosting.data.budgetMaxCentavos,
                            status: attachedPosting.data.status,
                          }}
                          footer={
                            <div className="border-t border-hairline px-2 py-1.5">
                              <button
                                type="button"
                                className="text-xs text-ink-muted hover:text-ink"
                                onClick={clearAttachedPosting}
                              >
                                Remove posting
                              </button>
                            </div>
                          }
                        />
                      )}
                      {attachedOffer.isError && !attachmentUnavailable && (
                        <p className="text-sm text-danger-700">{attachedOffer.error.message}</p>
                      )}
                      {attachedPosting.isError && !postingAttachmentUnavailable && (
                        <p className="text-sm text-danger-700">{attachedPosting.error.message}</p>
                      )}
                    </div>
                  )}
                  {error && <p className="mb-2 text-sm text-danger-700">{error}</p>}
                  <div className="flex flex-row items-end gap-2">
                    <label htmlFor="reply-body" className="sr-only">
                      Reply
                    </label>
                    <textarea
                      id="reply-body"
                      ref={replyRef}
                      rows={1}
                      maxLength={2000}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write a reply"
                      className={cn(
                        'min-h-10 max-h-28 min-w-0 flex-1 resize-none rounded-sm border border-hairline-strong bg-surface',
                        'px-3 py-2 text-base leading-5 text-ink',
                        'focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none',
                      )}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                      }}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-10 shrink-0 self-end"
                      loading={send.isPending}
                    >
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
