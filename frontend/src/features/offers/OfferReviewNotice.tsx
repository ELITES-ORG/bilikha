import { Badge } from '@/components/ui';
import type { OwnOffer } from './api';
import { reviewNotice } from './offer-review';

/**
 * Where one of the creative's own offers stands in review (ADR 0058): a badge
 * and a sentence. Shown on their offer cards and at the top of the editor.
 */
export function OfferReviewNotice({
  offer,
  className,
}: {
  offer: Pick<OwnOffer, 'status' | 'rejectionReason' | 'revisionRejectionReason' | 'pendingChanges'>;
  className?: string;
}) {
  const notice = reviewNotice(offer);
  return (
    <div className={className} role="status">
      <Badge tone={notice.tone}>{notice.label}</Badge>
      <p className="mt-1.5 text-sm text-pretty text-ink-muted">{notice.detail}</p>
    </div>
  );
}
