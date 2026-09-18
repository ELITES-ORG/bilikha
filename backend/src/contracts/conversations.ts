import type { AgreementCard } from './agreements.js';
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
}

/**
 * The same card the agreements API returns — aliased, not copied. It used to
 * be a duplicate that inlined the status and state unions, so adding a
 * lifecycle state would have updated one copy and silently not the other.
 */
export type ConversationAgreementCard = AgreementCard;

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
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

export type ConversationListResult = Paginated<ConversationListItem>;
