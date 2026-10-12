import type { IdDecisionPayload } from '@/features/admin/types';

/**
 * The decision panel's rules, as plain logic (ADR 0031): the same the API
 * enforces, checked first so the panel can say what is missing instead of
 * sending a request it knows will be refused.
 */

export type IdDecision = IdDecisionPayload['decision'];

export interface DecisionDraft {
  reason: string;
  idNumber: string;
  noIdNumber: boolean;
  /** Set once the administrator has seen the matching accounts. */
  acknowledgeMatch: boolean;
}

export const REASON_MAX = 500;
export const ID_NUMBER_MAX = 64;

/** Why this decision cannot be sent yet, or null when it can. */
export function decisionProblem(decision: IdDecision, draft: DecisionDraft): string | null {
  const reason = draft.reason.trim();
  const idNumber = draft.idNumber.trim();

  if (reason.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  if (idNumber.length > ID_NUMBER_MAX) return 'That is longer than any ID number.';
  if (decision !== 'verify' && !reason) return 'Write the reason the person will see.';
  if (decision !== 'retry') {
    if (idNumber && draft.noIdNumber) {
      return 'Give the ID number, or say the document has none — not both.';
    }
    if (!idNumber && !draft.noIdNumber) {
      return 'Type the ID number from the photo, or tick that this document has none.';
    }
  }
  if (decision === 'verify' && draft.acknowledgeMatch && !reason) {
    return 'Say why this ID is verified despite matching another account.';
  }
  return null;
}

/**
 * A change to the number, or to the no-number box. The matches the
 * administrator saw were for the number as it was, so the acknowledgement goes
 * with it: a different number must be checked against its own matches.
 */
export function withNumberChange(
  draft: DecisionDraft,
  patch: Partial<Pick<DecisionDraft, 'idNumber' | 'noIdNumber'>>,
): DecisionDraft {
  return { ...draft, ...patch, acknowledgeMatch: false };
}

/**
 * The request body: only what this decision uses. *Try again* sends no number —
 * the photo may be unreadable — and an empty field is left out, not sent blank.
 */
export function decisionBody(decision: IdDecision, draft: DecisionDraft): IdDecisionPayload {
  const reason = draft.reason.trim();
  const idNumber = draft.idNumber.trim();
  return {
    decision,
    ...(reason ? { reason } : {}),
    ...(decision !== 'retry' && draft.noIdNumber ? { noIdNumber: true } : {}),
    ...(decision !== 'retry' && !draft.noIdNumber && idNumber ? { idNumber } : {}),
    ...(draft.acknowledgeMatch ? { acknowledgeMatch: true } : {}),
  };
}
