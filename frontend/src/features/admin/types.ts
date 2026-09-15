export type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';

export type ModerationActionType = 'approved' | 'rejected' | 'returned_to_pending';

export interface AdminQueueRow {
  id: string;
  slug: string;
  status: ProfileStatus;
  createdAt: string;
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
  status: ProfileStatus;
}

export interface AdminProfileDetail {
  id: string;
  slug: string;
  status: ProfileStatus;
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
