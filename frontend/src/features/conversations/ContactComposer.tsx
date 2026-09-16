import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStartConversation } from '@/features/conversations/api';
import {
  clearMessageDraft,
  loadMessageDraft,
  saveMessageDraft,
  type MessageDraft,
} from '@/features/conversations/draft';
import { Button, Input, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';

interface ContactComposerProps {
  profileSlug: string;
  creativeName: string;
  /** Prefill when no saved draft exists (e.g. contact about an offer). */
  initialMessage?: string;
  /** When contacting about a specific offer; omit for profile-level contact. */
  offerId?: string;
  onCancel?: () => void;
}

type Phase = 'compose' | 'sending' | 'done';

function initialDraft(profileSlug: string, initialMessage?: string): MessageDraft {
  return loadMessageDraft(profileSlug) ?? { subject: '', message: initialMessage ?? '' };
}

/** Compose-and-send only. Starts or continues a conversation. */
export function ContactComposer({
  profileSlug,
  creativeName,
  initialMessage,
  offerId,
  onCancel,
}: ContactComposerProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const start = useStartConversation();

  const [phase, setPhase] = useState<Phase>('compose');
  const [subject, setSubject] = useState(() => initialDraft(profileSlug, initialMessage).subject);
  const [message, setMessage] = useState(() => initialDraft(profileSlug, initialMessage).message);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function submitConversation(draft: MessageDraft) {
    setPhase('sending');
    setError(null);
    try {
      await toast.run(
        'Sending message…',
        async () => {
          const result = await start.mutateAsync({
            profileSlug,
            subject: draft.subject,
            body: draft.message,
            ...(offerId ? { offerId } : {}),
          });
          clearMessageDraft(profileSlug);
          setConversationId(result.id);
          setPhase('done');
        },
        { success: 'Message sent', error: (err) => toApiError(err).message },
      );
    } catch (err) {
      setPhase('compose');
      setError(toApiError(err).message);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const draft: MessageDraft = { subject: subject.trim(), message: message.trim() };
    if (draft.subject.length < 3) {
      setFieldErrors({ subject: 'Too short' });
      return;
    }
    if (draft.message.length < 20) {
      setFieldErrors({ message: 'Give a little more detail' });
      return;
    }

    saveMessageDraft(profileSlug, draft);
    await submitConversation(draft);
  }

  if (phase === 'done' && conversationId) {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-6">
        <h2 className="u-display text-2xl text-ink">Message sent</h2>
        <p className="mt-3 text-base text-ink-muted text-pretty">
          {creativeName} will see this next time they sign in to Bilikha. There is
          no email or SMS notification.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={() => void navigate(`/messages/${conversationId}`)}>
            Open conversation
          </Button>
          <Link to="/messages" className="link-underline inline-flex items-center text-base text-lawa-700">
            All messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="rounded-sm border border-hairline bg-surface p-6" onSubmit={(e) => void onSend(e)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="u-display text-2xl text-ink">Contact {creativeName}</h2>
          <p className="mt-2 text-sm text-ink-muted">Write your message and send it.</p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-danger-700">{error}</p>}

      <div className="mt-6 grid gap-4">
        <Input
          label="Subject"
          required
          value={subject}
          onChange={(e) => {
            const next = e.target.value;
            setSubject(next);
            saveMessageDraft(profileSlug, { subject: next, message });
          }}
          error={fieldErrors.subject}
          maxLength={120}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-message" className="text-sm font-medium text-ink">
            Message<span className="ms-0.5 text-danger-600">*</span>
          </label>
          <textarea
            id="contact-message"
            required
            rows={6}
            maxLength={2000}
            value={message}
            onChange={(e) => {
              const next = e.target.value;
              setMessage(next);
              saveMessageDraft(profileSlug, { subject, message: next });
            }}
            className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            aria-invalid={fieldErrors.message ? true : undefined}
          />
          <div className="flex justify-between text-xs text-ink-subtle">
            <span>{fieldErrors.message ?? 'At least 20 characters'}</span>
            <span className="tabular-nums">{message.length}/2000</span>
          </div>
        </div>
        <Button type="submit" size="lg" loading={phase === 'sending' || start.isPending}>
          Send message
        </Button>
      </div>
    </form>
  );
}
