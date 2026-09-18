import type {
  NotificationType,
  ResolvedNotification,
} from '@contracts/notifications';

export type { NotificationType, ResolvedNotification };

/** Client name for the list row — same wire shape as `ResolvedNotification`. */
export type AppNotification = ResolvedNotification;
