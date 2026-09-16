export interface PublicProfileSubdomain {
  slug: string;
  name: string;
  domain: string;
  isPrimary: boolean;
}

export interface PublicProfile {
  slug: string;
  displayName: string | null;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  municipality: string;
  isNearby?: boolean;
  subdomains: PublicProfileSubdomain[];
  memberSince: string;
}

export interface ListPublishedParams {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  page?: number;
  limit?: number;
}

export interface ListPublishedResult {
  data: PublicProfile[];
  meta: { page: number; limit: number; total: number };
}
