export interface ConversationMessage {
  id: string;
  body: string;
  senderUserId: string;
  fromSelf: boolean;
  senderName: string;
  createdAt: string;
}

export interface ConversationThread {
  id: string;
  subject: string;
  role: 'client' | 'creative';
  otherPartyUserId: string;
  otherPartyName: string;
  messages: ConversationMessage[];
}

export interface ConversationListItem {
  id: string;
  subject: string;
  profileSlug: string;
  otherPartyName: string;
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
  subject: string;
  body: string;
}

export interface StartConversationResult {
  id: string;
  subject: string;
  continued: boolean;
  message: {
    id: string;
    body: string;
    createdAt: string;
  };
}
