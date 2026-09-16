/** Offer card embedded on a message (GET /conversations/:id). */
export type MessageOffer = {
  id: string;
  title: string;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  image: { url: string; thumbUrl: string } | null;
};

export interface ConversationMessage {
  id: string;
  body: string;
  senderUserId: string;
  fromSelf: boolean;
  senderName: string;
  createdAt: string;
  /** Attached offer, or null/omitted when none / cleared after delete. */
  offer?: MessageOffer | null;
  /**
   * When the backend still knows an offer was attached but can no longer
   * resolve it (deleted). Optional so older payloads remain valid.
   */
  offerRemoved?: boolean;
}

export interface ConversationThread {
  id: string;
  role: 'client' | 'creative';
  otherPartyUserId: string;
  otherPartyName: string;
  otherPartyAvatarUrl?: string | null;
  messages: ConversationMessage[];
}

export interface ConversationListItem {
  id: string;
  profileSlug: string;
  otherPartyName: string;
  otherPartyAvatarUrl?: string | null;
  role: 'client' | 'creative';
  lastMessage: {
    body: string;
    fromSelf: boolean;
    createdAt: string;
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

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
export interface HistoryItem {
  id: string;
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
}
