import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Trash2, TriangleAlert } from 'lucide-react';
import {
  Button,
  Container,
  EmptyState,
  Input,
  Skeleton,
  StatItem,
  useToast,
} from '@/components/ui';
import { relativeTime } from '@/features/conversations/relative-time';
import { useAnswerRatingReport, useRatingReports } from '@/features/ratings/api';
import { starsLabel } from '@/features/ratings/format';
import { StarRow } from '@/features/ratings/components/StarRow';
import type { RatingReport } from '@/features/ratings/types';
import { toApiError } from '@/lib/api-client';
import { AdminPageHeader } from './admin-ui';

export function AdminRatingsPage() {
  const reports = useRatingReports();

  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="Reported ratings"
        description="Oldest first. An appeal is a creative's only recourse against a rating, so answer it quickly: either the rating stands, or it goes with a reason on the record."
        aside={
          reports.data &&
          reports.data.meta.total > 0 && (
            <dl className="flex">
              <StatItem
                value={reports.data.meta.total}
                label={reports.data.meta.total === 1 ? 'Appeal waiting' : 'Appeals waiting'}
              />
            </dl>
          )
        }
      />

      <div className="mt-10 border-t border-hairline pt-2">
        {reports.isPending && (
          <ul className="divide-y divide-hairline" aria-label="Loading appeals">
            {[0, 1].map((i) => (
              <li key={i} className="space-y-3 py-6" aria-hidden="true">
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-20 w-full max-w-2xl" />
              </li>
            ))}
          </ul>
        )}

        {reports.isError && (
          <div className="pt-6">
            <EmptyState
              icon={<TriangleAlert className="size-5" />}
              title="Could not load the appeals"
              description={reports.error.message}
              action={
                <Button variant="secondary" size="sm" onClick={() => void reports.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        )}

        {reports.data && reports.data.data.length === 0 && (
          <div className="pt-6">
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="No reported ratings"
              description="Appeals from creatives about ratings on their profile appear here."
            />
          </div>
        )}

        {reports.data && reports.data.data.length > 0 && (
          <ul className="divide-y divide-hairline border-b border-hairline">
            {reports.data.data.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}

/**
 * One appeal, and the only two answers there are: leave the rating standing, or
 * remove it with a reason that goes into `moderation_actions`. There is no
 * control here that changes what the client wrote — ADR 0033.
 */
function ReportRow({ report }: { report: RatingReport }) {
  const toast = useToast();
  const answer = useAnswerRatingReport();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  async function dismiss() {
    try {
      await toast.run(
        'Dismissing the report…',
        () => answer.mutateAsync({ action: 'dismiss', reportId: report.id }),
        { success: 'Report dismissed', error: (error) => toApiError(error).message },
      );
    } catch {
      // Already reported in the toast.
    }
  }

  async function remove() {
    setReasonError(null);
    const text = reason.trim();
    if (!text) {
      setReasonError('A reason is required when removing a rating.');
      return;
    }

    try {
      await toast.run(
        'Removing the rating…',
        () => answer.mutateAsync({ action: 'remove', ratingId: report.rating.id, reason: text }),
        { success: 'Rating removed', error: (error) => toApiError(error).message },
      );
      setReason('');
    } catch (error) {
      setReasonError(toApiError(error).message);
    }
  }

  return (
    <li className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-ink-muted">
            <Link
              to={`/creatives/${report.profileSlug}`}
              className="font-semibold text-ink underline-offset-4 hover:underline"
            >
              {report.creativeName}
            </Link>{' '}
            appealed a rating from <span className="font-semibold text-ink">{report.raterName}</span>
          </p>
          <p className="text-xs text-ink-subtle">
            <time dateTime={report.createdAt}>{relativeTime(report.createdAt)}</time>
          </p>
        </div>

        {/* The words under appeal, quoted — the client's, unedited (ADR 0033). */}
        <figure className="mt-4 border-l-2 border-hairline-strong pl-4">
          <div className="flex flex-wrap items-center gap-2">
            <StarRow value={report.rating.stars} label={starsLabel(report.rating.stars)} />
            <span className="text-xs text-ink-subtle">
              {report.rating.packageTitle} ·{' '}
              <time dateTime={report.rating.createdAt}>{relativeTime(report.rating.createdAt)}</time>
            </span>
          </div>
          {report.rating.comment ? (
            <blockquote className="mt-2 text-base whitespace-pre-wrap text-pretty text-ink">
              {report.rating.comment}
            </blockquote>
          ) : (
            <p className="mt-2 text-sm text-ink-subtle">Stars only, no note.</p>
          )}
        </figure>

        <div className="mt-5">
          <p className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">
            Why they appealed
          </p>
          <p className="mt-1 text-base whitespace-pre-wrap text-pretty text-ink">{report.reason}</p>
        </div>
      </div>

      <div className="space-y-3 lg:border-l lg:border-hairline lg:pl-10">
        <Input
          label="Reason for removing"
          hint="Recorded against the client who wrote it. Required to remove, ignored to dismiss."
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={reasonError ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={answer.isPending}
            onClick={() => void dismiss()}
          >
            Dismiss, leave the rating
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
            iconLeft={<Trash2 className="size-4" aria-hidden="true" />}
            disabled={answer.isPending}
            onClick={() => void remove()}
          >
            Remove the rating
          </Button>
        </div>
      </div>
    </li>
  );
}
