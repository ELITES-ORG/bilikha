/**
 * Job posting feed and detail responses (ADR 0037).
 *
 * `client`, `hasReplied`, and `replyCount` are present only on some views —
 * feed vs own list vs detail — so they stay optional on the shared shape.
 */

export type PostingStatus = 'open' | 'closed' | 'expired';

export interface PostingSubdomain {
  slug: string;
  name: string;
  domain: string;
}

export interface PostingMunicipality {
  slug: string;
  name: string;
}

export interface PostingClient {
  name: string;
  avatarUrl: string | null;
}

export interface Posting {
  id: string;
  title: string;
  description: string | null;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  status: PostingStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  flaggedAt: string | null;
  reviewedAt: string | null;
  subdomain: PostingSubdomain;
  municipality: PostingMunicipality;
  client?: PostingClient;
  hasReplied?: boolean;
  replyCount?: number;
}

export interface PostingListResult {
  data: Posting[];
  total: number;
}
