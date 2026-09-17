export type PostingStatus = 'open' | 'closed' | 'expired';

export type PostingSubdomain = {
  slug: string;
  name: string;
  domain: string;
};

export type PostingMunicipality = {
  slug: string;
  name: string;
};

export type PostingClient = {
  name: string;
  avatarUrl: string | null;
};

export type Posting = {
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
};

export type PostingWriteInput = {
  title: string;
  subdomainSlug: string;
  municipalitySlug: string;
  description?: string;
  budgetMinCentavos?: number;
  budgetMaxCentavos?: number;
  expiresInDays?: number;
};

export type PostingPatchInput = {
  title?: string;
  subdomainSlug?: string;
  municipalitySlug?: string;
  description?: string | null;
  budgetMinCentavos?: number | null;
  budgetMaxCentavos?: number | null;
};

export type ListPostingsParams = {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  page?: number;
  limit?: number;
};

export type ListPostingsResult = {
  data: Posting[];
  meta: { page: number; limit: number; total: number };
};
