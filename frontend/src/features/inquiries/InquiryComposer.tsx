import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { useSendInquiry } from '@/features/inquiries/api';
import {
  clearInquiryDraft,
  loadInquiryDraft,
  saveInquiryDraft,
  type InquiryDraft,
} from '@/features/inquiries/draft';
import { Button, ButtonLink, Input } from '@/components/ui';
import { toApiError } from '@/lib/api-client';

interface InquiryComposerProps {
  profileSlug: string;
  creativeName: string;
}

type Phase = 'compose' | 'sending' | 'done';

function initialDraft(profileSlug: string): InquiryDraft {
  return loadInquiryDraft(profileSlug) ?? { subject: '', message: '' };
}

export function InquiryComposer({ profileSlug, creativeName }: InquiryComposerProps) {
  const { data: user } = useCurrentUser();
  const send = useSendInquiry();
  const location = useLocation();

  const [phase, setPhase] = useState<Phase>('compose');
  const [subject, setSubject] = useState(() => initialDraft(profileSlug).subject);
  const [message, setMessage] = useState(() => initialDraft(profileSlug).message);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const returnTo = `${location.pathname}${location.search}`;

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

    if (!user) {
      setError('Sign in to send your message. Your draft is saved on this device.');
      return;
    }

    await submitInquiry(draft);
  }

  if (phase === 'done') {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-6">
        <h2 className="u-display text-2xl text-ink">Inquiry sent</h2>
        <p className="mt-3 text-base text-ink-muted text-pretty">
          {creativeName} will see this in their Bilikha inbox. There is no email
          notification — check your sent inquiries for a response.
        </p>
        <Link to="/inquiries" className="link-underline mt-6 inline-block text-base text-lawa-700">
          View sent inquiries
        </Link>
      </div>
    );
  }

  return (
    <form className="rounded-sm border border-hairline bg-surface p-6" onSubmit={(e) => void onSend(e)}>
      <h2 className="u-display text-2xl text-ink">Contact {creativeName}</h2>
      <p className="mt-2 text-sm text-ink-muted">
        {user
          ? 'Write your message and send it.'
          : 'Write your message first. You will need an account to send it.'}
      </p>

      {error && <p className="mt-4 text-sm text-danger-700">{error}</p>}

      {!user && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink to={`/login?next=${encodeURIComponent(returnTo)}`} size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink to={`/register?next=${encodeURIComponent(returnTo)}`} variant="ghost" size="sm">
            Create an account
          </ButtonLink>
        </div>
      )}

      <div className="mt-6 grid gap-4">
        <Input
          label="Subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
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
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            aria-invalid={fieldErrors.message ? true : undefined}
          />
          <div className="flex justify-between text-xs text-ink-subtle">
            <span>{fieldErrors.message ?? 'At least 20 characters'}</span>
            <span className="tabular-nums">{message.length}/2000</span>
          </div>
        </div>
        <Button type="submit" size="lg" loading={phase === 'sending' || send.isPending} disabled={!user}>
          Send inquiry
        </Button>
      </div>
    </form>
  );
}
