import type { ReactNode } from 'react';
import { CircleCheck, CircleX, Clock, MessageSquareText, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { MessageKey } from '@/i18n/catalogs/en';
import { Message } from '@/i18n/Message';
import { cn } from '@/lib/cn';
import type { OwnOffer } from './api';
import { reviewNotice, type ReviewState } from './offer-review';

const iconClass = 'size-3.5';

const STATES: Record<
  ReviewState,
  { tone: 'success' | 'warning' | 'danger'; icon: ReactNode; label: MessageKey; detail: MessageKey }
> = {
  pending: {
    tone: 'warning',
    icon: <Clock className={iconClass} aria-hidden="true" />,
    label: 'offers.review.pending.label',
    detail: 'offers.review.pending.detail',
  },
  rejected: {
    tone: 'danger',
    icon: <CircleX className={iconClass} aria-hidden="true" />,
    label: 'offers.review.rejected.label',
    detail: 'offers.review.rejected.detail',
  },
  changesPending: {
    tone: 'warning',
    icon: <Clock className={iconClass} aria-hidden="true" />,
    label: 'offers.review.changesPending.label',
    detail: 'offers.review.changesPending.detail',
  },
  changesRejected: {
    tone: 'danger',
    icon: <TriangleAlert className={iconClass} aria-hidden="true" />,
    label: 'offers.review.changesRejected.label',
    detail: 'offers.review.changesRejected.detail',
  },
  live: {
    tone: 'success',
    icon: <CircleCheck className={iconClass} aria-hidden="true" />,
    label: 'offers.review.live.label',
    detail: 'offers.review.live.detail',
  },
};

/**
 * Where one of the creative's own offers stands in review (ADR 0058), on their
 * offer cards and at the top of the editor. An administrator's reason is the
 * first thing read after the badge, set apart and labelled as theirs; what to
 * do next follows in the app's own, quieter voice.
 */
export function OfferReviewNotice({
  offer,
  className,
}: {
  offer: Pick<OwnOffer, 'status' | 'rejectionReason' | 'revisionRejectionReason' | 'pendingChanges'>;
  className?: string;
}) {
  const { state, reason } = reviewNotice(offer);
  const { tone, icon, label, detail } = STATES[state];

  return (
    <div className={cn('space-y-2.5', className)} role="status">
      <Badge tone={tone} icon={icon}>
        <Message k={label} />
      </Badge>

      {reason && (
        <figure className="rounded-md border border-danger-100 bg-danger-50 px-3 py-2.5">
          <figcaption className="flex items-center gap-1.5 text-xs font-semibold text-danger-700">
            <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
            <Message k="offers.review.reasonLabel" />
          </figcaption>
          {/* Their words, as written: no quotes added, no language assumed. */}
          <blockquote className="mt-1 text-sm font-medium break-words whitespace-pre-line text-ink">
            {reason}
          </blockquote>
        </figure>
      )}

      <p className="text-sm text-pretty text-ink-muted">
        <Message k={detail} />
      </p>
    </div>
  );
}
