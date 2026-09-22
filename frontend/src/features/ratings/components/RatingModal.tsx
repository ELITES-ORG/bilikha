import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, useToast } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import type { RatingPayload } from '../types';
import { StarRadioGroup } from './StarRadioGroup';

const NOTE_LIMIT = 500;

export interface RatingModalProps {
  heading: string;
  description?: string;
  submitLabel: string;
  /** "Not now" on the prompt, "Cancel" when editing. Both just close. */
  dismissLabel: string;
  pendingMessage: string;
  successMessage: string;
  initialStars?: number;
  initialComment?: string;
  pending?: boolean;
  onSubmit: (payload: RatingPayload) => Promise<unknown>;
  onClose: () => void;
}

/**
 * Five stars, a short note, Submit and a way out. Whoever renders this keeps it
 * out of another `<form>`: it carries its own, and a nested form silently
 * breaks submission in every browser.
 *
 * Dismissing is a real answer, not a postponement the product then nags about
 * — ADR 0033: a rating nobody was pushed into is worth more. Nothing here
 * schedules a second ask.
 */
export function RatingModal({
  heading,
  description,
  submitLabel,
  dismissLabel,
  pendingMessage,
  successMessage,
  initialStars = 0,
  initialComment = '',
  pending = false,
  onSubmit,
  onClose,
}: RatingModalProps) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState(initialStars);
  const [comment, setComment] = useState(initialComment);
  const [starsError, setStarsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarsError(null);
    setError(null);

    if (stars < 1 || stars > 5) {
      setStarsError('Choose between one and five stars.');
      return;
    }

    const note = comment.trim();

    try {
      await toast.run(pendingMessage, () => onSubmit(note ? { stars, comment: note } : { stars }), {
        success: successMessage,
        error: (err) => toApiError(err).message,
      });
      onClose();
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-md border border-hairline bg-surface p-5 shadow-md focus:outline-none"
      >
        <h2 id="rating-modal-title" className="u-display text-xl text-ink">
          {heading}
        </h2>

        {description && <p className="mt-2 text-sm text-ink-muted text-pretty">{description}</p>}

        {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}

        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4" noValidate>
          <StarRadioGroup
            name="rating-stars"
            legend="Your rating"
            value={stars}
            onChange={(next) => {
              setStars(next);
              setStarsError(null);
            }}
            error={starsError ?? undefined}
            disabled={pending}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rating-comment" className="text-sm font-medium text-ink">
              A short note (optional)
            </label>
            <textarea
              id="rating-comment"
              rows={4}
              maxLength={NOTE_LIMIT}
              value={comment}
              disabled={pending}
              onChange={(event) => setComment(event.target.value)}
              className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            />
            <div className="flex justify-between text-xs text-ink-subtle">
              <span>This appears on their public profile, with your name.</span>
              <span className="tabular-nums">
                {comment.length}/{NOTE_LIMIT}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {submitLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onClose}
            >
              {dismissLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
