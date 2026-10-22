/**
 * Account-hub profile and saved-offer responses (ADR 0037).
 */

import type { ProfileCover } from './profiles.js';

export type OwnProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
export type ContactPreference = 'phone' | 'email';

export interface OwnProfile {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  displayName: string | null;
  bio: string | null;
  municipalitySlug: string | null;
  barangaySlug: string | null;
  contactPreference: ContactPreference;
  email: string;
  phone: string;
  status: OwnProfileStatus;
  rejectionReason: string | null;
  editedSinceReviewAt: string | null;
  subdomainSlugs: string[];
  primarySubdomainSlug: string | null;
  /** The approved cover, as the public sees it (ADR 0061). */
  cover: ProfileCover | null;
  /** A new cover waiting for review, seen only by its owner (ADR 0058). */
  pendingCover: ProfileCover | null;
  /** Why the last new cover was not approved; cleared by the next upload. */
  coverRejectionReason: string | null;
}

export interface SavedOfferImage {
  url: string;
  thumbUrl: string;
}

export interface SavedOfferSummary {
  id: string;
  title: string;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  image: SavedOfferImage | null;
}

export interface SavedOfferCreative {
  slug: string;
  displayName: string;
  municipality: string;
  avatarUrl: string | null;
}

export interface SavedOfferItem {
  id: string;
  savedAt: string;
  offer: SavedOfferSummary;
  creative: SavedOfferCreative;
}

export interface SavedOfferListResult {
  data: SavedOfferItem[];
}
