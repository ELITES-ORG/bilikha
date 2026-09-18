/**
 * Work-agreement responses (ADR 0037). Totals and end dates are derived on the
 * server — nothing here is ever posted back up as stored columns.
 *
 * The card embedded on a conversation message is duplicated in
 * conversations.ts (contracts may not import each other). Keep those fields
 * in step with AgreementCard.
 */

export type AgreementStatus = 'sent' | 'accepted' | 'superseded' | 'withdrawn';

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

/** Card embedded on a message and used by loadAgreementCards. */
export interface AgreementCard {
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

export interface DerivedState {
  state: AgreementState;
  /** Who put it in this state. Null only when an accepted row has no acceptance to read. */
  actorUserId: string | null;
  at: string | null;
}

export interface AgreementEventEntry {
  id: string;
  type: AgreementEventType;
  note: string | null;
  actorUserId: string;
  actorName: string | null;
  createdAt: string;
}

export interface AgreementAcceptanceView {
  acceptedByUserId: string;
  acceptedByName: string | null;
  acceptedAt: string;
  /** First 12 characters of the hash — the fingerprint shown on the record. */
  fingerprint: string;
}

/** Detail state includes a resolved actor name for the UI. */
export interface AgreementDetailState {
  state: AgreementState;
  actorUserId: string | null;
  actorName: string | null;
  at: string | null;
}

/** The record itself (GET /agreements/:id). */
export interface AgreementDetail {
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
  acceptance: AgreementAcceptanceView | null;
  events: AgreementEventEntry[];
  state: AgreementDetailState;
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

export interface AgreementListResult {
  data: AgreementListRow[];
}
