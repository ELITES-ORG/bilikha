/**
 * Admin feature types. Response shapes live in `@contracts/admin` (ADR 0037).
 * Payloads stay here.
 */

import type {
  AccountStatus,
  AdminAccount,
  AdminProfileDetail,
  AdminQueueMeta,
  AdminQueueRow,
  AdminQueueStatus,
  AdminProfileStatus,
  ModerationActionType,
} from '@contracts/admin';

export type {
  AccountStatus,
  AdminAccount,
  AdminProfileDetail,
  AdminQueueMeta,
  AdminQueueRow,
  ModerationActionType,
};

export type ProfileStatus = AdminProfileStatus;
export type QueueStatus = AdminQueueStatus;

export interface ModeratePayload {
  action: ModerationActionType;
  reason?: string;
}
