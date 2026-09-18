/**
 * Conversation list and thread responses (ADR 0037).
 *
 * The agreement card on a message is duplicated here rather than imported from
 * an agreements contract: contract files may not import anything, including
 * each other. Keep the fields in step with AgreementCard when that lands.
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

export interface ConversationAgreementCard {
  id: string;
  version: number;
  packageTitle: string;
  totalCentavos: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: 'sent' | 'accepted' | 'superseded' | 'withdrawn';
  state:
    | 'Awaiting response'
    | 'Superseded'
    | 'Withdrawn'
    | 'Agreed'
    | 'In progress'
    | 'Awaiting confirmation'
    | 'Completed'
    | 'Cancelled';
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

export interface ConversationListResult {
  data: ConversationListItem[];
  meta: { total: number; page: number; limit: number };
}
