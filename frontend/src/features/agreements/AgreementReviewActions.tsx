import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { formatPesos } from '@/lib/money';
import { useAcceptAgreement, useRequestRevision } from './api';
import { formatDate } from './format';
import type { Agreement } from './types';

type Panel = 'closed' | 'revision' | 'accept';

/**
 * Asks for the password that confirms the client agreed to these exact terms,
 * and carries the hash of the document this screen rendered. The server checks
 * that hash before it looks at the password, so a client whose agreement
 * changed under them is told that rather than asked to authenticate.
 */
function AcceptDialog({
  agreement,
  onClose,
}: {
  agreement: Agreement;
  onClose: () => void;
}) {
  const toast = useToast();
  const accept = useAcceptAgreement(agreement.id);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }

    try {
      await toast.run(
        'Recording your acceptance…',
        () => accept.mutateAsync({ password, seenHash: agreement.contentHash }),
        { success: 'Work agreement accepted', error: (err) => toApiError(err).message },
      );
      setPassword('');
      onClose();
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="accept-agreement-title"
        className="w-full max-w-md rounded-md border border-hairline bg-surface p-5 shadow-md"
      >
        <h2 id="accept-agreement-title" className="u-display text-xl text-ink">
          Accept this work agreement?
        </h2>

        <div className="mt-3 rounded-sm border border-hairline bg-clay-50 px-3 py-2">
          <p className="text-sm font-medium text-ink">{agreement.packageTitle}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatPesos(agreement.totalCentavos)} · {formatDate(agreement.startDate)} to{' '}
            {formatDate(agreement.endDate)}
          </p>
        </div>

        <p className="mt-3 text-sm text-ink-muted text-pretty">
          This records that you agreed to these terms, with your name and the time. It is not a
          legal signature, and Bilikha does not handle payment.
        </p>

        <form onSubmit={(event) => void onSubmit(event)} className="mt-4 space-y-3" noValidate>
          <Input
            label="Your password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error ?? undefined}
          />
          {/* Kept out of the field's hint so a wrong password does not replace
              it: saying this is what makes a phishing attempt look wrong. */}
          <p className="text-xs text-ink-subtle text-pretty">
            Bilikha will never ask for your password from a link or a message. This prompt is only
            reachable from inside your own conversation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={accept.isPending}>
              Accept these terms
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={accept.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * The client's two moves on an agreement still awaiting a response: ask for
 * changes, or accept. Renders nothing for the creative, and nothing once the
 * document is no longer `sent` — an accepted agreement is frozen, so neither
 * party sees an action on it.
 */
export function AgreementReviewActions({ agreement }: { agreement: Agreement }) {
  const toast = useToast();
  const revise = useRequestRevision(agreement.id);
  const [panel, setPanel] = useState<Panel>('closed');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  if (agreement.role !== 'client' || agreement.status !== 'sent') return null;

  async function onRequestChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNoteError(null);
    const text = note.trim();
    if (!text) {
      setNoteError('Say what needs changing.');
      return;
    }

    try {
      await toast.run('Sending your note…', () => revise.mutateAsync(text), {
        success: 'Changes requested',
        error: (err) => toApiError(err).message,
      });
      setNote('');
      setPanel('closed');
    } catch (err) {
      setNoteError(toApiError(err).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setPanel('accept')}>
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setPanel((current) => (current === 'revision' ? 'closed' : 'revision'))}
        >
          Request changes
        </Button>
      </div>

      {panel === 'revision' && (
        <form
          onSubmit={(event) => void onRequestChanges(event)}
          className="rounded-sm border border-hairline bg-surface p-3"
          noValidate
        >
          <Input
            label="What needs changing?"
            required
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={noteError ?? undefined}
            hint="The creative gets your note in this conversation and can send a new version."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={revise.isPending}>
              Send note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={revise.isPending}
              onClick={() => setPanel('closed')}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {panel === 'accept' && (
        <AcceptDialog agreement={agreement} onClose={() => setPanel('closed')} />
      )}
    </div>
  );
}
