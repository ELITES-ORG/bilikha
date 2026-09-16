import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSendInquiry } from '@/features/inquiries/api';
import {
  clearInquiryDraft,
  loadInquiryDraft,
  saveInquiryDraft,
  type InquiryDraft,
} from '@/features/inquiries/draft';
import { Button, Input } from '@/components/ui';
import { toApiError } from '@/lib/api-client';

interface InquiryComposerProps {
  profileSlug: string;
  creativeName: string;
  onCancel?: () => void;
}

type Phase = 'compose' | 'sending' | 'done';

function initialDraft(profileSlug: string): InquiryDraft {
  return loadInquiryDraft(profileSlug) ?? { subject: '', message: '' };
}

/** Compose-and-send only. The profile page gates this behind a session. */
export function InquiryComposer({ profileSlug, creativeName, onCancel }: InquiryComposerProps) {
  const send = useSendInquiry();

  const [phase, setPhase] = useState<Phase>('compose');
  const [subject, setSubject] = useState(() => initialDraft(profileSlug).subject);
  const [message, setMessage] = useState(() => initialDraft(profileSlug).message);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submitInquiry(draft: InquiryDraft) {
    setPhase('sending');
    setError(null);
    try {
      await send.mutateAsync({
        profileSlug,
        subject: draft.subject,
        message: draft.message,
      });
      clearInquiryDraft(profileSlug);
      setPhase('done');
    } catch (err) {
      setPhase('compose');
      setError(toApiError(err).message);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const draft: InquiryDraft = { subject: subject.trim(), message: message.trim() };
    if (draft.subject.length < 3) {
      setFieldErrors({ subject: 'Too short' });
      return;
    }
    if (draft.message.length < 20) {
      setFieldErrors({ message: 'Give a little more detail' });
      return;
    }

    saveInquiryDraft(profileSlug, draft);
    await submitInquiry(draft);
  }

  if (phase === 'done') {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-6">
        <h2 className="u-display text-2xl text-ink">Inquiry sent</h2>
        <p className="mt-3 text-base text-ink-muted text-pretty">
          {creativeName} will see this next time they sign in to Bilikha. There is
          no email or phone notification.
        </p>
        <Link to="/inquiries" className="link-underline mt-6 inline-block text-base text-lawa-700">
          View sent inquiries
        </Link>
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
            saveInquiryDraft(profileSlug, { subject: next, message });
          }}
          error={fieldErrors.subject}
          maxLength={120}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-message" className="text-sm font-medium text-ink">
            Message<span className="ms-0.5 text-danger-600">*</span>
          </label>
          <textarea
            id="inquiry-message"
            required
            rows={6}
            maxLength={2000}
            value={message}
            onChange={(e) => {
              const next = e.target.value;
              setMessage(next);
              saveInquiryDraft(profileSlug, { subject, message: next });
            }}
            className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            aria-invalid={fieldErrors.message ? true : undefined}
          />
          <div className="flex justify-between text-xs text-ink-subtle">
            <span>{fieldErrors.message ?? 'At least 20 characters'}</span>
            <span className="tabular-nums">{message.length}/2000</span>
          </div>
        </div>
        <Button type="submit" size="lg" loading={phase === 'sending' || send.isPending}>
          Send inquiry
        </Button>
      </div>
    </form>
  );
}
