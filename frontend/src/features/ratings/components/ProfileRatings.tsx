import { useState } from 'react';
import { Button, Skeleton } from '@/components/ui';
import { relativeTime } from '@/features/conversations/relative-time';
import { useProfileRatings, useRatingSummary } from '../api';
import { starsLabel } from '../format';
import { RatingScore } from './RatingScore';
import { ReportRatingControl } from './ReportRatingControl';
import { StarRow } from './StarRow';

const PAGE_SIZE = 20;

export interface ProfileRatingsProps {
  slug: string;
  /** The creative reading their own profile, who may appeal a rating. */
  isOwner: boolean;
}

/**
 * The score, its count and the reviews behind it. Suspended raters are already
 * gone by the time this renders — the API derives both the list and the count
 * with the same joins, so the number here always matches what is under it.
 */
export function ProfileRatings({ slug, isOwner }: ProfileRatingsProps) {
  const [page, setPage] = useState(1);
  const summary = useRatingSummary(slug);
  const reviews = useProfileRatings(slug, page);

  const total = reviews.data?.meta.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="mt-10" aria-labelledby="ratings-heading">
      <h2 id="ratings-heading" className="u-display text-2xl text-ink">
        Ratings
      </h2>

      <div className="mt-4">
        {summary.isPending && <Skeleton className="h-6 w-48" />}
        {summary.isError && <p className="text-sm text-danger-700">{summary.error.message}</p>}
        {summary.data && (
          <RatingScore
            summary={summary.data}
            emptyText="No ratings yet. Ratings come from clients who confirmed an engagement complete."
            size="md"
          />
        )}
      </div>

      {reviews.isError && <p className="mt-4 text-sm text-danger-700">{reviews.error.message}</p>}

      {reviews.data && reviews.data.data.length > 0 && (
        <>
          <ul className="mt-6 space-y-6">
            {reviews.data.data.map((review) => (
              <li key={review.id} className="border-t border-hairline pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRow value={review.stars} label={starsLabel(review.stars)} />
                  <span className="text-sm font-medium text-ink">{review.raterName}</span>
                  <span className="text-xs text-ink-subtle">
                    <time dateTime={review.createdAt}>{relativeTime(review.createdAt)}</time>
                  </span>
                </div>

                {review.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-base text-ink text-pretty">
                    {review.comment}
                  </p>
                )}

                {isOwner && <ReportRatingControl ratingId={review.id} />}
              </li>
            ))}
          </ul>

          {lastPage > 1 && (
            <div className="mt-6 flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Newer
              </Button>
              <p className="text-sm text-ink-muted">
                Page {page} of {lastPage}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={page >= lastPage}
                onClick={() => setPage((current) => current + 1)}
              >
                Older
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
