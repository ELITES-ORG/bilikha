import { useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { useRecordAgreementEvent } from './api';
import type { Agreement, AgreementEventType } from './types';

const NON_TERMINAL = ['Agreed', 'In progress', 'Awaiting confirmation'];

/**
 * Only the move the current state and the viewer's side allow — the rest are
 * refused server-side anyway, and offering them would be a lie about whose turn
 * it is. No password on any of these: only acceptance takes one.
 */
export function AgreementLifecycleActions({ agreement }: { agreement: Agreement }) {
  const toast = useToast();
  const record = useRecordAgreementEvent(agreement.id);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const state = agreement.state.state;
  const isCreative = agreement.role === 'creative';

  // Nothing moves on an agreement nobody has accepted yet, and nothing follows
  // Completed or Cancelled.
  if (agreement.status !== 'accepted' || !NON_TERMINAL.includes(state)) return null;

  async function move(type: AgreementEventType, pending: string, success: string) {
    try {
      await toast.run(pending, () => record.mutateAsync({ type }), {
        success,
        error: (err) => toApiError(err).message,
      });
    } catch {
      // Already reported in the toast.
    }
  }

  async function onCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReasonError(null);
    const note = reason.trim();
    if (!note) {
      setReasonError('Give a reason for cancelling.');
      return;
    }

    try {
      await toast.run(
        'Cancelling the engagement…',
        () => record.mutateAsync({ type: 'cancelled', note }),
        { success: 'Engagement cancelled', error: (err) => toApiError(err).message },
      );
      setReason('');
      setCancelling(false);
    } catch (err) {
      setReasonError(toApiError(err).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {state === 'Agreed' && isCreative && (
          <Button
            type="button"
            size="sm"
            loading={record.isPending}
            onClick={() => void move('started', 'Marking as started…', 'Marked as started')}
          >
            Mark as started
          </Button>
        )}

        {state === 'In progress' && isCreative && (
          <Button
            type="button"
            size="sm"
            loading={record.isPending}
            onClick={() =>
              void move('delivery_marked', 'Marking work delivered…', 'Marked as delivered')
            }
          >
            Mark work delivered
          </Button>
        )}

        {state === 'Awaiting confirmation' && !isCreative && (
          <Button
            type="button"
            size="sm"
            loading={record.isPending}
            onClick={() =>
              void move('completion_confirmed', 'Confirming completion…', 'Completion confirmed')
            }
          >
            Confirm completion
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setCancelling((current) => !current)}
        >
          Cancel engagement
        </Button>
      </div>

      {/* The creative cannot complete their own work, so they get a line rather
          than a button they are not allowed to press (ADR 0029). */}
      {state === 'Awaiting confirmation' && isCreative && (
        <p className="text-sm text-ink-muted">Waiting for the client to confirm completion.</p>
      )}

      {cancelling && (
        <form
          onSubmit={(event) => void onCancel(event)}
          className="rounded-sm border border-hairline bg-surface p-3"
          noValidate
        >
          <Input
            label="Reason for cancelling"
            required
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reasonError ?? undefined}
            hint="Both of you will see this on the record."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" loading={record.isPending}>
              Cancel the engagement
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={record.isPending}
              onClick={() => setCancelling(false)}
            >
              Keep it open
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
