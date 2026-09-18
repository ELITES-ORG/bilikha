/**
 * Public profile feature types. Response shapes live in `@contracts/profiles`
 * and `@contracts/offers` (ADR 0037). Query params stay here.
 *
 * `avatarUrl` stays optional on the composed client type: the two tiers deploy
 * independently, and reading it unguarded crashed the directory when Render
 * was still on an older payload.
 */

import type { ProfileOffer } from '@contracts/offers';
import type {
  PublicProfile as ContractPublicProfile,
  PublicProfileSubdomain,
} from '@contracts/profiles';
import type { Paginated } from '@contracts/pagination';

export type { ProfileOffer, PublicProfileSubdomain };

export type PublicProfile = ContractPublicProfile & {
  // Optional because the two tiers deploy independently: the frontend can be
  // live on Vercel while Render is still serving a payload without these.
  // Reading them unguarded crashes the directory for everyone.
  avatarUrl?: string | null;
  /** @deprecated Replaced by offers; kept optional for older API responses. */
  portfolio?: { id: string; url: string; thumbUrl: string; caption: string | null }[];
  offers?: ProfileOffer[];
};

export interface ListPublishedParams {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  page?: number;
  limit?: number;
}

export type ListPublishedResult = Paginated<PublicProfile>;
