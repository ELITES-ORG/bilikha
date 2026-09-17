/**
 * Shapes returned by the agreements API. The total and the end date arrive
 * derived — no column stores either — so nothing here is ever sent back up.
 */
export type AgreementStatus = 'sent' | 'accepted' | 'superseded' | 'withdrawn';

/** The engagement state the server derives from the newest event. */
export type AgreementState =
  | 'Awaiting response'
  | 'Superseded'
  | 'Withdrawn'
  | 'Agreed'
  | 'In progress'
  | 'Awaiting confirmation'
  | 'Completed'
  | 'Cancelled';

export type AgreementEventType =
  | 'started'
  | 'delivery_marked'
  | 'completion_confirmed'
  | 'cancelled';

export interface AgreementLineItem {
  id: string;
  description: string;
  priceCentavos: number;
  sortOrder: number;
}

/** Card embedded on a message (GET /conversations/:id). */
export interface MessageAgreement {
  id: string;
  version: number;
  packageTitle: string;
  totalCentavos: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: AgreementStatus;
  state: AgreementState;
}

export interface AgreementEventEntry {
  id: string;
  type: AgreementEventType;
  note: string | null;
  actorUserId: string;
  actorName: string | null;
  createdAt: string;
}

/** The record itself (GET /agreements/:id). */
export interface Agreement {
  id: string;
  conversationId: string;
  /** Which side of the conversation the viewer is on. */
  role: 'client' | 'creative';
  version: number;
  supersedesId: string | null;
  supersededById: string | null;
  supersededByVersion: number | null;
  packageTitle: string;
  notes: string | null;
  startDate: string;
  durationDays: number;
  /** `startDate + durationDays`, worked out by the server. */
  endDate: string;
  status: AgreementStatus;
  /** Sum of the line items. */
  totalCentavos: number;
  /** The full hash of exactly these terms. Sent back on accept, never displayed. */
  contentHash: string;
  lineItems: AgreementLineItem[];
  issuedBy: { userId: string; name: string | null };
  createdAt: string;
  revisionNote: string | null;
  revisionRequestedAt: string | null;
  acceptance: {
    acceptedByUserId: string;
    acceptedByName: string | null;
    acceptedAt: string;
    /** First 12 characters of the hash — the fingerprint shown on the record. */
    fingerprint: string;
  } | null;
  events: AgreementEventEntry[];
  state: {
    state: AgreementState;
    actorUserId: string | null;
    actorName: string | null;
    at: string | null;
  };
}

/** One row of the History index (GET /agreements?mode=). */
export interface AgreementListRow {
  id: string;
  conversationId: string;
  version: number;
  packageTitle: string;
  totalCentavos: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  status: AgreementStatus;
  state: AgreementState;
  stateAt: string | null;
  otherPartyName: string;
}

export interface IssueAgreementPayload {
  packageTitle: string;
  notes?: string;
  startDate: string;
  durationDays: number;
  lineItems: { description: string; priceCentavos: number }[];
  /** The version this one replaces, when answering a request for changes. */
  supersedesId?: string;
}

export interface AcceptAgreementPayload {
  password: string;
  /** The hash of the terms the screen rendered. */
  seenHash: string;
}

export interface RecordEventPayload {
  type: AgreementEventType;
  note?: string;
}
