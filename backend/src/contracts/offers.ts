/**
 * Published offer shapes shared by the offer index and the creative profile
 * embed (ADR 0037). One nested `subdomain` object — the flat
 * `subdomainSlug`/`subdomainName` split blanked the public profile for every
 * creative who had an offer.
 *
 * The type-only import of the sibling ratings contract is what ADR 0037 allows
 * and nothing more: the detail's creative carries a rating summary so the page
 * needs one request rather than two.
 */

import type { RatingSummary } from './ratings.js';

export interface OfferSubdomain {
  slug: string;
  name: string;
  domain: string;
}

export interface OfferImage {
  id: string;
  url: string;
  thumbUrl: string;
  sortOrder: number;
}

/** Offer as embedded on a public creative profile. */
export interface ProfileOffer {
  id: string;
  title: string;
  description: string | null;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  subdomain: OfferSubdomain;
  images: OfferImage[];
}

export interface PublishedOfferCreative {
  slug: string;
  displayName: string | null;
  municipality: string;
  avatarUrl: string | null;
  isNearby?: boolean;
}

/**
 * The detail's creative, which also carries the rating summary.
 *
 * Deliberately a separate type rather than an optional field on the card's
 * creative. A summary is one aggregate per creative, so putting it on the card
 * would mean one query per row of the directory — the hot path — to render
 * something that is empty for everyone today. Detail only, where there is
 * exactly one creative.
 */
export interface PublishedOfferDetailCreative extends PublishedOfferCreative {
  rating: RatingSummary;
}

export interface PublishedOfferCard {
  id: string;
  title: string;
  description: string | null;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  createdAt: string;
  subdomain: OfferSubdomain;
  image: OfferImage | null;
  creative: PublishedOfferCreative;
}

export interface PublishedOfferDetail {
  id: string;
  title: string;
  description: string | null;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  createdAt: string;
  updatedAt: string;
  subdomain: OfferSubdomain;
  images: OfferImage[];
  creative: PublishedOfferDetailCreative;
}

export interface PublishedOfferListResult {
  data: PublishedOfferCard[];
  total: number;
}
