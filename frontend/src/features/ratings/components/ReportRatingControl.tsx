import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { useReportRating } from '../api';

/**
 * The creative's appeal against one rating on their own profile. Two taps from
 * reading it — Report, then send — because it is their only recourse: there is
 * no public reply, and nobody rewrites the words (ADR 0033).
 *
 * Kept out of any surrounding form: the reason panel carries its own.
 */
export function ReportRatingControl({ ratingId }: { ratingId: string }) {
  const toast = useToast();
  const report = useReportRating(ratingId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const text = reason.trim();
    if (!text) {
      setError('Say what is wrong with this rating.');
      return;
    }

    try {
      await toast.run('Sending your report…', () => report.mutateAsync(text), {
        success: 'Report sent',
        error: (err) => toApiError(err).message,
      });
      setReason('');
      setOpen(false);
      setSent(true);
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  if (sent) {
    return (
      <p className="mt-2 text-xs text-ink-subtle">
        Reported. An administrator will read it and either leave the rating or remove it.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        Report this rating
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 p-4 sm:items-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-rating-${ratingId}`}
            tabIndex={-1}
            className="w-full max-w-md rounded-md border border-hairline bg-surface p-5 shadow-md focus:outline-none"
          >
            <h2 id={`report-rating-${ratingId}`} className="u-display text-xl text-ink">
              Report this rating
            </h2>
            <p className="mt-2 text-sm text-ink-muted text-pretty">
              An administrator will read this and either leave the rating as it is or remove it.
              Nobody edits what the client wrote.
            </p>

            <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3" noValidate>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`report-reason-${ratingId}`}
                  className="text-sm font-medium text-ink"
                >
                  What is wrong with it?
                  <span className="ms-0.5 text-danger-600" aria-hidden>
                    *
                  </span>
                </label>
                <textarea
                  id={`report-reason-${ratingId}`}
                  required
                  rows={4}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `report-error-${ratingId}` : undefined}
                  className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
                />
                {error && (
                  <p id={`report-error-${ratingId}`} className="text-xs text-danger-700">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={report.isPending}>
                  Send report
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={report.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
