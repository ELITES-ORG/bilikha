/**
 * Agreements feature types. Response shapes live in `@contracts/agreements`
 * (ADR 0037). Payloads stay here.
 */

import type {
  AgreementCard,
  AgreementDetail,
  AgreementEventEntry,
  AgreementEventType,
  AgreementLineItem,
  AgreementListRow,
  AgreementState,
  AgreementStatus,
} from '@contracts/agreements';

export type {
  AgreementEventEntry,
  AgreementEventType,
  AgreementLineItem,
  AgreementListRow,
  AgreementState,
  AgreementStatus,
};

/** Card embedded on a message — same wire shape as `AgreementCard`. */
export type MessageAgreement = AgreementCard;

/** The record itself (GET /agreements/:id). */
export type Agreement = AgreementDetail;

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
