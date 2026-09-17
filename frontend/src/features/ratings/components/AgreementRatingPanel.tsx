import { useState } from 'react';
import { Button, Skeleton, useToast } from '@/components/ui';
import { formatMoment } from '@/features/agreements/format';
import type { Agreement } from '@/features/agreements/types';
import { relativeTime } from '@/features/conversations/relative-time';
import { toApiError } from '@/lib/api-client';
import { useAgreementRating, useDeleteRating, useRateAgreement, useUpdateRating } from '../api';
import { insideEditWindow, starsLabel } from '../format';
import { RatingModal } from './RatingModal';
import { StarRow } from './StarRow';

export interface AgreementRatingPanelProps {
  agreement: Agreement;
  /** True only just after the client confirmed completion on this screen. */
  promptOpen: boolean;
  onPromptClose: () => void;
}

/**
 * Where "later" leads (plan 0021 step 4.2). A completed, unrated engagement
 * offers the client the rating it earned; once left, the same place shows it,
 * with an Edit control for as long as the server will accept one.
 *
 * The creative sees nothing here. They cannot rate their own work, and the
 * rating itself is already on their profile, which is also where their only
 * recourse against it lives (ADR 0033).
 */
export function AgreementRatingPanel({
  agreement,
  promptOpen,
  onPromptClose,
}: AgreementRatingPanelProps) {
  const toast = useToast();
  const isClient = agreement.role === 'client';
  const completed = agreement.state.state === 'Completed';

  const rating = useAgreementRating(agreement.id, isClient && completed);
  const existing = rating.data ?? null;

  const rate = useRateAgreement(agreement.id);
  const update = useUpdateRating(existing?.id ?? '');
  const remove = useDeleteRating(existing?.id ?? '');

  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!isClient) return null;

  const creativeName = agreement.issuedBy.name ?? 'this creative';
  const editable = existing ? insideEditWindow(existing.editableUntil) : false;

  function closeAsk() {
    setAsking(false);
    onPromptClose();
  }

  async function deleteRating() {
    try {
      await toast.run('Taking your rating down…', () => remove.mutateAsync(), {
        success: 'Rating removed',
        error: (error) => toApiError(error).message,
      });
      setConfirmingDelete(false);
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <>
      {completed && (
        <section className="rounded-md border border-hairline bg-surface p-5">
          <h2 className="text-base font-medium text-ink">Your rating</h2>

          {rating.isPending && <Skeleton className="mt-3 h-6 w-48" />}

          {rating.isError && <p className="mt-2 text-sm text-danger-700">{rating.error.message}</p>}

          {rating.isSuccess && !existing && (
            <>
              <p className="mt-1 text-sm text-ink-muted text-pretty">
                You confirmed this engagement complete, so you can rate {creativeName}. It appears
                on their public profile with your name.
              </p>
              <div className="mt-3">
                <Button type="button" size="sm" onClick={() => setAsking(true)}>
                  Rate this creative
                </Button>
              </div>
            </>
          )}

          {existing && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StarRow value={existing.stars} label={starsLabel(existing.stars)} size="md" />
                <span className="text-sm text-ink-muted">
                  Left {relativeTime(existing.createdAt)}
                </span>
              </div>

              {existing.comment && (
                <p className="mt-2 whitespace-pre-wrap text-base text-ink text-pretty">
                  “{existing.comment}”
                </p>
              )}

              {editable ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit
                    </Button>

                    {confirmingDelete ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          loading={remove.isPending}
                          onClick={() => void deleteRating()}
                        >
                          Take it down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => setConfirmingDelete(false)}
                        >
                          Keep it
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingDelete(true)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-subtle">
                    {confirmingDelete
                      ? 'This takes it off their profile, and the count with it.'
                      : `You can change this until ${formatMoment(existing.editableUntil)}.`}
                  </p>
                </>
              ) : (
                // Nothing after the window: frozen for everyone, including an
                // administrator, who removes rather than rewrites (ADR 0033).
                <p className="mt-3 text-xs text-ink-subtle">
                  The fourteen days for changing this have passed.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {(promptOpen || asking) && !existing && (
        <RatingModal
          heading={`Rate ${creativeName}`}
          description="One rating for this engagement. You can change it for the next fourteen days."
          submitLabel="Submit rating"
          dismissLabel="Not now"
          pendingMessage="Leaving your rating…"
          successMessage="Rating left"
          pending={rate.isPending}
          onSubmit={(payload) => rate.mutateAsync(payload)}
          onClose={closeAsk}
        />
      )}

      {editing && existing && (
        <RatingModal
          heading="Change your rating"
          description="This replaces what is on their profile now."
          submitLabel="Save changes"
          dismissLabel="Cancel"
          pendingMessage="Saving your rating…"
          successMessage="Rating updated"
          initialStars={existing.stars}
          initialComment={existing.comment ?? ''}
          pending={update.isPending}
          onSubmit={(payload) => update.mutateAsync(payload)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
