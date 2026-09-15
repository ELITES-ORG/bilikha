export type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
export type QueueStatus = ProfileStatus | 'edited';

export type ModerationActionType =
  | 'approved'
  | 'rejected'
  | 'returned_to_pending'
  | 'acknowledged_edit';

export interface AdminQueueRow {
  id: string;
  slug: string;
  status: ProfileStatus;
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
  status: QueueStatus;
}

export interface AdminProfileDetail {
  id: string;
  slug: string;
  status: ProfileStatus;
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
  subdomains: Array<{ name: string; slug: string; isPrimary: boolean }>;
  history: Array<{
    action: ModerationActionType;
    reason: string | null;
    createdAt: string;
    adminUsername: string | null;
  }>;
}

export interface ModeratePayload {
  action: ModerationActionType;
  reason?: string;
}
