import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CircleCheck,
  EllipsisVertical,
  SendHorizontal,
  ShieldOff,
  TriangleAlert,
} from 'lucide-react';
import { Avatar, Button, ButtonLink, Container, EmptyState, Input, Skeleton } from '@/components/ui';
import { useAgreement } from '@/features/agreements/api';
import { AgreementComposer } from '@/features/agreements/AgreementComposer';
import { MessageAgreementBlock } from '@/features/agreements/AgreementCard';
import { AgreementReviewActions } from '@/features/agreements/AgreementReviewActions';
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

type ComposerMode = 'closed' | 'open';

/** Calendar day in the reader's time zone, for grouping messages by day. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(iso) === dayKey(now.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: new Date(iso).getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function ConversationMenu({
  open,
  onToggle,
  onReport,
  onBlock,
  draft,
}: {
  open: boolean;
  onToggle: () => void;
  onReport: () => void;
  onBlock: () => void;
  /** Creative side only, and only while the composer is closed. */
  draft?: { label: string; onSelect: () => void } | null;
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
          {/*
           * Drafting sits in its own group above a divider. The two items below
           * it report and block a person, and an action someone reaches for
           * often should not share an edge with one they can only do once.
           */}
          {draft && (
            <>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-clay-50"
                onClick={draft.onSelect}
              >
                {draft.label}
              </button>
              <div className="my-1 border-t border-hairline" role="separator" />
            </>
          )}
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
  const [composer, setComposer] = useState<ComposerMode>('closed');
  const markedFor = useRef<string | null>(null);

  const isCreative = thread.data?.role === 'creative';

  /**
   * The newest agreement in the thread still awaiting the client's response.
   * A creative answering a request for changes replaces that version rather
   * than issuing a second live one.
   */
  const openAgreementId = useMemo(() => {
    const messages = thread.data?.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const attached = messages[index]?.agreement;
      if (attached?.status === 'sent') return attached.id;
    }
    return null;
  }, [thread.data?.messages]);

  const openAgreement = useAgreement(openAgreementId ?? undefined);
  // Read from the record, not the card: the card on an older message may have
  // been rendered before the client accepted or a newer version replaced it.
  // The record also carries the content hash the accept confirmation needs.
  const openRecord = openAgreement.data?.status === 'sent' ? openAgreement.data : null;

  /**
   * Drafting lives in the conversation menu rather than as a permanent row
   * above the composer: only the creative can ever use it, and on a 346px
   * screen it was costing every conversation vertical space for something
   * reached occasionally.
   *
   * Null while the composer is open — the form is already on screen, so
   * offering to open it again says nothing.
   */
  const draftMenuItem =
    !blocked && isCreative && composer === 'closed'
      ? {
          label: openRecord ? `Send version ${openRecord.version + 1}` : 'Draft agreement',
          onSelect: () => {
            setMenu('closed');
            setComposer('open');
          },
        }
      : null;

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
    <div
      className={cn(
        // The fixed phone composer needs room under the last message; from lg
        // the thread is a column that fills its pane instead.
        thread.data && !blocked ? pbConversationComposer : pbBottomNav,
        'lg:flex lg:h-full lg:flex-col',
      )}
    >
      {/* Phone chat header: back + avatar + name | ⋮ */}
      <header className="sticky top-(--staging-banner-h) z-40 flex h-14 items-center gap-1 border-b border-hairline bg-paper/90 px-1 backdrop-blur-sm sm:hidden">
        <Link
          to="/messages"
          viewTransition
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
              draft={draftMenuItem}
            />
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        )}
      </header>

      <Container
        width="narrow"
        className="max-sm:py-4 py-(--section-gap) lg:flex lg:min-h-0 lg:max-w-none lg:flex-1 lg:flex-col lg:p-0"
      >
          {/* Desktop back + party row; from lg, the pane's header */}
          <div className="mb-4 hidden items-center justify-between gap-4 sm:flex lg:mb-0 lg:border-b lg:border-hairline lg:px-5 lg:py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                to="/messages"
                viewTransition
                aria-label="Back to messages"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-clay-100 hover:text-ink lg:hidden"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
              {thread.data ? (
                <>
                  <Avatar src={partyAvatar} name={partyName!} size="md" />
                  <h1 className="u-display truncate text-2xl text-ink lg:text-xl">{partyName}</h1>
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
                draft={draftMenuItem}
              />
            )}
          </div>

          {thread.isPending && (
            <div className="space-y-4 lg:p-5" aria-hidden="true">
              <Skeleton radius="md" className="h-14 w-2/3" />
              <Skeleton radius="md" className="ml-auto h-10 w-1/2" />
              <Skeleton radius="md" className="h-20 w-3/5" />
              <Skeleton radius="md" className="ml-auto h-10 w-2/5" />
            </div>
          )}

          {thread.isError && (
            <div className="lg:p-5">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load this conversation"
                description={thread.error.message}
                action={
                  <ButtonLink to="/messages" size="sm" variant="secondary">
                    Back to messages
                  </ButtonLink>
                }
              />
            </div>
          )}

          {thread.data && (
            <>
              {/* From lg this is the part of the pane that scrolls; the header
                  above and the composer below stay put. */}
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5 lg:py-4">
              {reportDone && (
                <p className="mb-4 flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                  <CircleCheck className="size-4 shrink-0 text-success-600" aria-hidden />
                  Report received. An administrator will review it.
                </p>
              )}

              {blockConfirmed && !blocked && (
                <p className="mb-4 flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                  <ShieldOff className="size-4 shrink-0" aria-hidden />
                  {thread.data.otherPartyName} can no longer message you. You can still write to
                  them.
                </p>
              )}

              {menu === 'report' && (
                <form
                  onSubmit={(e) => void onReport(e)}
                  className="mb-4 rounded-md border border-hairline bg-surface p-4 shadow-xs"
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
                <div className="mb-4 rounded-md border border-hairline bg-surface p-4 shadow-xs">
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

              <ol className="flex flex-col" aria-label="Messages">
                {thread.data.messages.map((msg, index, all) => {
                  const prev = all[index - 1];
                  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(msg.createdAt);
                  // Same sender within five minutes reads as one run of messages.
                  const grouped =
                    !newDay &&
                    prev?.fromSelf === msg.fromSelf &&
                    Date.parse(msg.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
                  return (
                  <li
                    key={msg.id}
                    className={cn('flex flex-col', msg.fromSelf ? 'items-end' : 'items-start', grouped ? 'mt-1' : 'mt-4')}
                  >
                  {newDay && (
                    <p className="my-3 self-center text-xs font-medium text-ink-subtle">
                      {dayLabel(msg.createdAt)}
                    </p>
                  )}
                  <div
                    className={cn(
                      'max-w-[min(85%,36rem)] rounded-2xl px-3.5 py-2.5 text-base',
                      msg.fromSelf
                        ? 'rounded-br-sm bg-primary text-on-primary'
                        : 'rounded-bl-sm border border-hairline bg-surface text-ink',
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
                    <MessageAgreementBlock
                      agreement={msg.agreement ?? null}
                      agreementRemoved={msg.agreementRemoved}
                      fromSelf={msg.fromSelf}
                    />
                    <p className="whitespace-pre-wrap text-pretty">{msg.body}</p>
                  </div>
                  {!grouped && (
                    <p className="mt-1 px-1 text-2xs text-ink-subtle tabular-nums">
                      {relativeTime(msg.createdAt)}
                    </p>
                  )}
                  </li>
                  );
                })}
              </ol>
              <div ref={bottomRef} />

              {/*
               * Agreement work is a sibling of the reply form below, never a
               * child of it: a nested <form> silently swallows the inner submit,
               * which is what broke Save in plan 0010.
               *
               * Renders only when the composer is open or a revision is
               * waiting. Drafting starts from the conversation menu now, so an
               * always-present block would be an empty frame in most threads —
               * but a client who asked for changes is waiting on an answer, and
               * that stays in the flow with the action attached to it.
               */}
              {!blocked && isCreative && (composer === 'open' || openRecord?.revisionRequestedAt) && (
                <div className="mt-8 border-t border-hairline pt-6">
                  {composer === 'open' ? (
                    <AgreementComposer
                      key={openRecord?.id ?? 'new'}
                      conversationId={id!}
                      supersedes={openRecord}
                      onIssued={() => setComposer('closed')}
                      onCancel={() => setComposer('closed')}
                    />
                  ) : (
                    <div className="space-y-3">
                      {openRecord?.revisionRequestedAt && (
                        <div className="rounded-sm border border-hairline bg-clay-50 px-3 py-2">
                          <p className="text-sm font-medium text-ink">
                            {thread.data.otherPartyName} asked for changes to version{' '}
                            {openRecord.version}
                          </p>
                          {openRecord.revisionNote && (
                            <p className="mt-1 text-sm text-ink-muted text-pretty">
                              “{openRecord.revisionNote}”
                            </p>
                          )}
                        </div>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setComposer('open')}
                      >
                        {openRecord ? `Send version ${openRecord.version + 1}` : 'Draft agreement'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!blocked && !isCreative && openRecord && (
                <div className="mt-8 border-t border-hairline pt-6">
                  <p className="text-sm font-medium text-ink">
                    A work agreement is waiting for your response
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {openRecord.packageTitle} · version {openRecord.version}.{' '}
                    <Link to={`/agreements/${openRecord.id}`} className="underline">
                      Read it in full
                    </Link>
                    .
                  </p>
                  <div className="mt-3">
                    <AgreementReviewActions agreement={openRecord} />
                  </div>
                </div>
              )}

              </div>

              {blocked ? (
                <div className="mt-8 border-t border-hairline pt-6 lg:mt-0 lg:px-5 lg:py-4">
                  <p className="text-base text-ink-muted text-pretty">
                    Messaging with this person is stopped. Further messages cannot be delivered.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void onReply(e)}
                  className={cn(
                    fixedComposerAboveNav,
                    'sm:mt-6 lg:mt-0 lg:shrink-0 lg:border-t lg:border-hairline lg:px-5 lg:py-3',
                  )}
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
                  {/* One field: the textarea and the send button share a border. */}
                  <div className="flex flex-row items-end gap-2 rounded-xl border border-hairline-strong bg-surface p-1.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-4 focus-within:ring-lawa-100">
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
                      className="min-h-10 max-h-28 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-base leading-5 text-ink focus:outline-none"
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                      }}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="size-11 shrink-0 self-end rounded-lg px-0 sm:size-11"
                      loading={send.isPending}
                      aria-label="Send"
                    >
                      <SendHorizontal className="size-5" aria-hidden="true" />
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
      </Container>
    </div>
  );
}
