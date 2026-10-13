import type { AdminSummary } from '../../contracts/admin.js';
import { openReportCount } from '../ratings/ratings.service.js';
import { openAppealCount, waitingIdCount } from '../verification/review.service.js';
import { statusCounts } from './admin.service.js';
import { contentQueueCounts } from './content-review.service.js';
import { organizationReviewCounts } from './organization-review.service.js';

/**
 * The admin sidebar's counts (ADR 0059): what waits for a decision under each
 * subject. Published and suspended rows are not waiting, so they are left out.
 */
export async function adminSummary(): Promise<AdminSummary> {
  const [profiles, organizations, content, reports, ids, appeals] = await Promise.all([
    statusCounts(),
    organizationReviewCounts(),
    contentQueueCounts(),
    openReportCount(),
    waitingIdCount(),
    openAppealCount(),
  ]);
  return {
    creatives: { pending: profiles.pending_review ?? 0, edited: profiles.edited ?? 0 },
    offers: { new: content.newOffers, changes: content.changedOffers },
    organizations: {
      pending: organizations.pending_review ?? 0,
      edited: organizations.edited ?? 0,
      logos: content.logos,
    },
    people: { photos: content.photos, ids, appeals },
    reports: { open: reports },
  };
}
