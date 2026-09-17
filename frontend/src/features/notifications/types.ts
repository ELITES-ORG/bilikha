export type NotificationType =
  | 'profile_approved'
  | 'profile_rejected'
  | 'profile_edit_acknowledged'
  | 'posting_replied';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  detail: string | null;
  /**
   * Null when the target no longer resolves — deleted, or owned by a suspended
   * account. The row still renders, as a tombstone: that it happened is still
   * true.
   */
  link: string | null;
  actor: { name: string; avatarUrl: string | null } | null;
  readAt: string | null;
  createdAt: string;
}
