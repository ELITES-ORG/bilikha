import type { ProfileOffer } from './offers.js';

/**
 * Public creative profile responses (ADR 0037).
 *
 * `offers` is not declared here: contract files cannot import each other, and
 * the embed must be the same `ProfileOffer` as in `offers.ts`. The detail
 * service annotates `PublicProfile & { offers: ProfileOffer[] }` so both stay
 * one shape. Directory cards omit offers.
 *
 * `avatarUrl` is required as `string | null` on the wire. The frontend may keep
 * it optional where a comment documents deployment skew between tiers.
 */

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
  /** Present when the viewer has a municipality; true if it matches this row. */
  isNearby?: boolean;
  subdomains: PublicProfileSubdomain[];
  memberSince: string;
}

export interface PublicProfileListResult {
  data: PublicProfile[];
  total: number;
}

/**
 * The single-profile response: the directory shape plus its offers. Lived in
 * the service while contracts could not import each other.
 */
export type PublicProfileDetail = PublicProfile & { offers: ProfileOffer[] };
