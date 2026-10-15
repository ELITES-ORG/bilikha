import type { AgreementCard } from './agreements.js';
import type { MediaKind } from './media.js';
import type { Paginated } from './pagination.js';

/**
 * Conversation list and thread responses (ADR 0037).
 *
 * The agreement card on a message is the agreements contract's card, named
 * here rather than copied. An earlier rule forbade a contract from importing
 * a sibling, which had produced a second copy of the card that inlined the
 * status and lifecycle unions; the rule was amended and the copy removed.
 */

export interface ConversationOfferCard {
  id: string;
  title: string;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  image: { url: string; thumbUrl: string } | null;
  available: boolean;
}

export interface ConversationPostingCard {
  id: string;
  title: string;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  status: 'open' | 'closed' | 'expired';
  expiresAt: string | null;
  available: boolean;
  municipalityName?: string;
  subdomainName?: string;
  /** Singular label for one offer, posting or creative (issue #17). Optional only
   *  for deployment skew: an API deployed before #17 omits it. Read it through
   *  `subdomainLabel()` on the frontend, which falls back to `name`. */
  subdomainSingularName?: string;
}

/**
 * The same card the agreements API returns — aliased, not copied. It used to
 * be a duplicate that inlined the status and state unions, so adding a
 * lifecycle state would have updated one copy and silently not the other.
 */
export type ConversationAgreementCard = AgreementCard;

/**
 * A file sent in a message (ADR 0060): what it is, never where it is. The
 * browser asks for a short signed URL when it is about to show or play it.
 */
export interface ConversationAttachment {
  id: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  /** An image's thumbnail or a video's poster can be asked for. */
  hasThumb: boolean;
  /** Null for a PDF, which is kept. */
  expiresAt: string | null;
  /** True from `expiresAt` on: no URL is issued, whatever the sweep has done. */
  expired: boolean;
}

/** `GET /conversations/:id/attachments/:attachmentId/url`. */
export interface ConversationAttachmentUrl {
  url: string;
  /** At most five minutes away, and never past the file's own expiry. */
  expiresAt: string;
}

export interface ConversationMessage {
  id: string;
  body: string;
  senderUserId: string;
  fromSelf: boolean;
  senderName: string;
  createdAt: string;
  offer: ConversationOfferCard | null;
  offerRemoved: boolean;
  posting: ConversationPostingCard | null;
  postingRemoved: boolean;
  agreement: ConversationAgreementCard | null;
  agreementRemoved: boolean;
  /** Up to five files, in a stable order. */
  attachments: ConversationAttachment[];
}

export interface ConversationThread {
  id: string;
  role: 'client' | 'creative';
  otherPartyUserId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  messages: ConversationMessage[];
}

export interface ConversationListItem {
  id: string;
  profileSlug: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  role: 'client' | 'creative';
  lastMessage: {
    body: string;
    fromSelf: boolean;
    createdAt: string;
    /** The kinds of file it carries, in order, so a message with no text can be described. */
    attachmentKinds: MediaKind[];
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

export type ConversationListResult = Paginated<ConversationListItem>;
