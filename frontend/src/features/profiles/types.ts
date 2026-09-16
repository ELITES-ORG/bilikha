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
  // Optional because the two tiers deploy independently: the frontend can be
  // live on Vercel while Render is still serving a payload without these.
  // Reading them unguarded crashes the directory for everyone.
  avatarUrl?: string | null;
  municipality: string;
  isNearby?: boolean;
  subdomains: PublicProfileSubdomain[];
  portfolio?: { id: string; url: string; thumbUrl: string; caption: string | null }[];
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
