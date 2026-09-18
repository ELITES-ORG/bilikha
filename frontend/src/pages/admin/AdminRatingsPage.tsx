import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, TriangleAlert } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  Container,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@/components/ui';
import { relativeTime } from '@/features/conversations/relative-time';
import { useAnswerRatingReport, useRatingReports } from '@/features/ratings/api';
import { starsLabel } from '@/features/ratings/format';
import { StarRow } from '@/features/ratings/components/StarRow';
import type { RatingReport } from '@/features/ratings/types';
import { toApiError } from '@/lib/api-client';

export function AdminRatingsPage() {
  const reports = useRatingReports();

  return (
    <Container width="wide" className="py-(--section-gap)">
      <p className="u-eyebrow">Administration</p>
      <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Reported ratings</h1>
      <p className="mt-3 max-w-xl text-md text-ink-muted">
        Oldest first. An appeal is a creative's only recourse against a rating, so answer it
        quickly: either the rating stands, or it goes with a reason on the record.
      </p>

      <div className="mt-10 space-y-4">
        {reports.isPending && (
          <>
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </>
        )}

        {reports.isError && (
          <EmptyState
            icon={<TriangleAlert className="size-5" />}
            title="Could not load the queue"
            description={reports.error.message}
          />
        )}

        {reports.data && reports.data.data.length === 0 && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No reported ratings"
            description="Appeals from creatives about ratings on their profile appear here."
          />
        )}

        {reports.data?.data.map((report) => <ReportRow key={report.id} report={report} />)}
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
    <Card elevation="flat">
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-ink-muted">
            <Link to={`/creatives/${report.profileSlug}`} className="link-underline text-lawa-700">
              {report.creativeName}
            </Link>{' '}
            appealed a rating from {report.raterName}
          </p>
          <p className="text-xs text-ink-subtle">
            <time dateTime={report.createdAt}>{relativeTime(report.createdAt)}</time>
          </p>
        </div>

        <div className="rounded-sm border border-hairline bg-clay-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StarRow value={report.rating.stars} label={starsLabel(report.rating.stars)} />
            <span className="text-xs text-ink-subtle">
              {report.rating.packageTitle} ·{' '}
              <time dateTime={report.rating.createdAt}>
                {relativeTime(report.rating.createdAt)}
              </time>
            </span>
          </div>
          {report.rating.comment ? (
            <p className="mt-2 whitespace-pre-wrap text-base text-ink text-pretty">
              {report.rating.comment}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-subtle">Stars only, no note.</p>
          )}
        </div>

        <div>
          <p className="text-xs text-ink-subtle">Why they appealed</p>
          <p className="mt-1 whitespace-pre-wrap text-base text-ink text-pretty">
            {report.reason}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            label="Reason for removing"
            hint="Recorded against the client who wrote it. Required to remove, ignored to dismiss."
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reasonError ?? undefined}
          />
          <div className="flex flex-wrap gap-2">
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
              disabled={answer.isPending}
              onClick={() => void remove()}
            >
              Remove the rating
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

