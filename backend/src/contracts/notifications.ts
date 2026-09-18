/**
 * In-app notification list rows. Titles and links are resolved at read time
 * so a deleted or suspended target tombstones rather than showing stale copy.
 */

export type NotificationType =
  | 'profile_approved'
  | 'profile_rejected'
  | 'profile_edit_acknowledged'
  | 'posting_replied'
  | 'agreement_issued'
  | 'agreement_revision_requested'
  | 'agreement_accepted'
  | 'agreement_event'
  | 'agreement_delivered'
  | 'agreement_completed'
  | 'agreement_cancelled'
  | 'rating_received';

export interface NotificationActor {
  name: string;
  avatarUrl: string | null;
}

export interface ResolvedNotification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string | null;
  /** Null when the target no longer resolves — rendered as a tombstone. */
  link: string | null;
  actor: NotificationActor | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  data: ResolvedNotification[];
  total: number;
}
