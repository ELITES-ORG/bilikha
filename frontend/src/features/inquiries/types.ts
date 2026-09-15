export type InquiryStatus = 'sent' | 'read' | 'responded' | 'declined';

export interface SentInquiry {
  id: string;
  subject: string;
  message: string;
  status: InquiryStatus;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  profile: { slug: string; name: string };
  contact: { channel: string; value: string } | null;
}

export interface ReceivedInquiry {
  id: string;
  subject: string;
  message: string;
  status: InquiryStatus;
  response: string | null;
  readAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  sender: { username: string; fullName: string };
}

export interface SendInquiryPayload {
  profileSlug: string;
  subject: string;
  message: string;
}

export interface RespondPayload {
  action: 'responded' | 'declined';
  response?: string;
}
