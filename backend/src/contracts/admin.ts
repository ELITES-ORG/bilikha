/**
 * Admin queue, profile detail, and account lookup responses (ADR 0037).
 */

export type AdminProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
export type AdminQueueStatus = AdminProfileStatus | 'edited';

export type ModerationActionType =
  | 'approved'
  | 'rejected'
  | 'returned_to_pending'
  | 'acknowledged_edit'
  | 'media_removed'
  | 'account_suspended'
  | 'account_reinstated'
  | 'rating_removed';

export type AccountStatus = 'active' | 'suspended';

/** A person an administrator can act on — not necessarily a creative. */
export interface AdminAccount {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'member' | 'admin';
  status: AccountStatus;
  createdAt: string;
  profileSlug: string | null;
  profileStatus: AdminProfileStatus | null;
}

export interface AdminQueueRow {
  id: string;
  slug: string;
  status: AdminProfileStatus;
  createdAt: string;
  editedSinceReviewAt: string | null;
  firstName: string;
  lastName: string;
  username: string;
  municipality: string;
  subdomainCount: number;
}

export interface AdminQueueMeta {
  page: number;
  limit: number;
  total: number;
  status: AdminQueueStatus;
}

export interface AdminProfileSubdomain {
  name: string;
  slug: string;
  isPrimary: boolean;
}

export interface AdminModerationHistoryEntry {
  action: ModerationActionType;
  reason: string | null;
  createdAt: string;
  adminUsername: string | null;
}

export interface AdminProfileDetail {
  id: string;
  slug: string;
  status: AdminProfileStatus;
  editedSinceReviewAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  userId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  municipality: string;
  subdomains: AdminProfileSubdomain[];
  history: AdminModerationHistoryEntry[];
}

export interface AdminProfileListResult {
  rows: AdminQueueRow[];
  total: number;
}
