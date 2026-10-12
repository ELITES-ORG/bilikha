/**
 * Admin queue, profile detail, and account lookup responses (ADR 0037).
 */

import type { ListMeta } from './pagination.js';

export type AdminProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
export type AdminQueueStatus = AdminProfileStatus | 'edited';

export type ModerationActionType =
  | 'approved'
  | 'rejected'
  | 'returned_to_pending'
  | 'acknowledged_edit'
  | 'media_removed'
  | 'account_suspended'
  | 'account_reinstated'
  | 'rating_removed'
  | 'password_reset'
  // ID verification (ADR 0057). Each of these rows names its id_verifications row.
  | 'id_viewed'
  | 'id_verified'
  | 'id_declined_retry'
  | 'id_declined_final'
  | 'id_decision_reversed'
  | 'id_appeal_granted'
  | 'id_appeal_upheld';

export type AccountStatus = 'active' | 'suspended';

/** A person an administrator can act on — not necessarily a creative. */
export interface AdminAccount {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'member' | 'admin';
  status: AccountStatus;
  createdAt: string;
  profileSlug: string | null;
  profileStatus: AdminProfileStatus | null;
}

export interface AdminQueueRow {
  id: string;
  slug: string;
  status: AdminProfileStatus;
  createdAt: string;
  editedSinceReviewAt: string | null;
  firstName: string;
  lastName: string;
  username: string;
  municipality: string;
  subdomainCount: number;
}

/** The queue is the one list whose meta carries which tab was asked for. */
export interface AdminQueueMeta extends ListMeta {
  status: AdminQueueStatus;
}

export interface AdminProfileSubdomain {
  name: string;
  /** Singular label for one offer, posting or creative (issue #17). Optional only
   *  for deployment skew: an API deployed before #17 omits it. Read it through
   *  `subdomainLabel()` on the frontend, which falls back to `name`. */
  singularName?: string;
  slug: string;
  isPrimary: boolean;
}

export interface AdminModerationHistoryEntry {
  action: ModerationActionType;
  reason: string | null;
  createdAt: string;
  adminUsername: string | null;
}

export interface AdminProfileDetail {
  id: string;
  slug: string;
  status: AdminProfileStatus;
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
  subdomains: AdminProfileSubdomain[];
  history: AdminModerationHistoryEntry[];
}

export interface AdminProfileListResult {
  rows: AdminQueueRow[];
  total: number;
}

/**
 * One image on an offer awaiting review. `state` says what the change does to
 * it (ADR 0058): `live` is published and stays, `pending_add` would be added,
 * `pending_remove` would be taken off.
 */
export interface AdminMediaImage {
  id: string;
  url: string;
  thumbUrl: string;
  sortOrder: number;
  state: 'live' | 'pending_add' | 'pending_remove';
}

/** The published version of an offer, shown beside a change waiting for review. */
export interface AdminPublishedOffer {
  title: string;
  description: string | null;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  subdomain: string;
}

/**
 * A row in the content review queue (ADR 0058): a new offer, a change to a
 * published one, or a new photo or organisation logo. Nothing in it is public
 * until it is approved.
 *
 * This is the wire shape. The service carries an extra `_flagged` sort helper
 * internally and strips it before responding, so it is deliberately absent here.
 */
export interface AdminMediaRow {
  /** The offer, account or organisation the item belongs to. */
  id: string;
  kind: 'avatar' | 'offer' | 'logo';
  /** For an offer: a new one, or a change to one already published. */
  change?: 'new' | 'edit';
  createdAt: string;
  /** The image under review: the new photo or logo, or an offer's first photo. */
  url: string | null;
  thumbUrl: string | null;
  caption: string | null;
  ownerName: string;
  profileSlug: string | null;
  profileId: string | null;
  /** For an offer, the version under review: new, or as the change would leave it. */
  title?: string;
  description?: string | null;
  priceMinCentavos?: number | null;
  priceMaxCentavos?: number | null;
  subdomain?: string;
  flaggedAt?: string | null;
  images?: AdminMediaImage[];
  /** For a change to a published offer: what the public sees now. */
  published?: AdminPublishedOffer;
  /** For a photo or logo replacing an approved one: the approved image. */
  currentUrl?: string | null;
  /** For a logo on a published page: its slug, to see the image in context. */
  organizationSlug?: string;
  /**
   * What the administrator is shown, as a token. A review is sent back with
   * it and refused if the item has changed since, so an edit made while the
   * queue is open is never approved unseen.
   */
  version: string;
}

export interface AdminMediaListResult {
  data: AdminMediaRow[];
  total: number;
}

/** What waits in the content queue, counted by where the admin area shows it. */
export interface ContentQueueCounts {
  newOffers: number;
  changedOffers: number;
  /** New profile photos, shown under People. */
  photos: number;
  /** New organisation logos, shown under Organisations. */
  logos: number;
}

/**
 * Everything waiting for an administrator's decision, by subject (ADR 0059):
 * one number per sidebar section, split the way each section's tabs are.
 */
export interface AdminSummary {
  creatives: { pending: number; edited: number };
  offers: { new: number; changes: number };
  organizations: { pending: number; edited: number; logos: number };
  /** Profile photos, and submitted IDs waiting for a decision (ADR 0057). */
  people: { photos: number; ids: number };
  reports: { open: number };
}
