/**
 * Conversation feature types. Response shapes live in `@contracts/conversations`
 * (ADR 0037). Client-only payloads and history rows stay here.
 */

import type {
  ConversationAgreementCard,
  ConversationListItem,
  ConversationMessage,
  ConversationOfferCard,
  ConversationPostingCard,
  ConversationThread,
} from '@contracts/conversations';
import type { PostingStatus } from '@/features/postings/types';

export type {
  ConversationAgreementCard,
  ConversationListItem,
  ConversationMessage,
  ConversationOfferCard,
  ConversationPostingCard,
  ConversationThread,
};

/** @deprecated Prefer ConversationOfferCard — kept as an alias for local imports. */
export type MessageOffer = ConversationOfferCard;

/** @deprecated Prefer ConversationPostingCard. */
export type MessagePosting = ConversationPostingCard;

/** @deprecated Prefer ConversationAgreementCard. */
export type MessageAgreement = ConversationAgreementCard;

export interface StartConversationPayload {
  profileSlug: string;
  body: string;
  /** Set when starting from an offer; omitted for profile-level contact. */
  offerId?: string;
}

/**
 * One row from GET /conversations/history — client inquiries grouped by offer.
 * `id` is typically the offer id (or a synthetic key). Prefer `conversationId`
 * when linking to the thread.
 */
export type EnsureConversationPayload =
  | { profileSlug: string }
  | { postingId: string };

export interface HistoryItem {
  id?: string;
  conversationId?: string;
  lastAskedAt?: string;
  /** @deprecated Prefer lastAskedAt — kept while the backend may still send it. */
  startedAt?: string;
  replied: boolean;
  unreadCount?: number;
  offer: {
    id: string;
    title: string;
    priceMinCentavos: number | null;
    priceMaxCentavos: number | null;
    image: { url?: string; thumbUrl: string } | null;
  } | null;
  creative: {
    slug: string;
    displayName: string;
    municipality: string;
    avatarUrl: string | null;
  };
}

/** Creative-mode history: postings you replied to, grouped by posting. */
export interface CreativeHistoryItem {
  conversationId: string;
  lastRepliedAt?: string;
  replied: boolean;
  posting: {
    id: string;
    title: string;
    budgetMinCentavos: number | null;
    budgetMaxCentavos: number | null;
    status?: PostingStatus;
  } | null;
  client: {
    name: string;
    municipality?: string;
    avatarUrl?: string | null;
  };
}

export interface StartConversationResult {
  id: string;
  continued: boolean;
  message: {
    id: string;
    body: string;
    createdAt: string;
  };
}

export interface EnsureConversationResult {
  id: string;
}

export interface SendMessagePayload {
  body: string;
  offerId?: string;
  postingId?: string;
}
