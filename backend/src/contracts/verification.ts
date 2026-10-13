/**
 * ID verification shapes (ADR 0057, plan 0053).
 *
 * No response to the account itself carries an object key or a URL — not even
 * for its own ID. Only the admin detail has URLs, and they are signed for
 * minutes.
 */

export type IdVerificationStatus =
  | 'pending'
  | 'verified'
  | 'declined_retry'
  | 'declined_final'
  /** A *not from Biliran* decline whose appeal is open. */
  | 'appealed';

/**
 * The accepted IDs, from issue #51. Each shows a Biliran address or is issued
 * in Biliran. Which of them has a back is runtime data, kept with the list in
 * the verification module.
 */
export type IdType =
  // Government-issued, showing an address in Biliran
  | 'philsys_id'
  | 'ephilid'
  | 'drivers_license'
  | 'postal_id'
  | 'umid'
  | 'voters_certification'
  // Issued in Biliran
  | 'barangay_id'
  | 'barangay_certificate_of_residency'
  | 'barangay_clearance'
  | 'senior_citizen_id'
  | 'pwd_id'
  // Schools in Biliran; the holder must still be 18 or older
  | 'college_id'
  | 'high_school_id';

/** What an account learns about its own verification. */
export interface OwnIdVerification {
  status: IdVerificationStatus;
  /** False while the open row is waiting for the photos. */
  submitted: boolean;
  /** The administrator's reason, only when declined. */
  reason: string | null;
  /**
   * When the latest decision was made, or null while waiting. Lets the account
   * say "your ID is verified" for a while after it happens, and not forever.
   * Optional for deployment skew (ADR 0040): an API from before it does not
   * send it.
   */
  decidedAt?: string | null;
}

/**
 * What `POST /verification/upload-url` returns: where the browser PUTs one
 * side of the ID, and the key to submit afterwards. The only response that
 * carries an ID key, because the account is the one uploading it.
 */
export interface IdUploadTicket {
  uploadUrl: string;
  objectKey: string;
}

/**
 * `details` of an `ID_DECLINED` error: a 401 when a session ends at a decline,
 * a 403 when signing in is refused.
 */
export interface IdDeclinedDetails {
  /** retry: sign in to resubmit; final: not from Biliran; appealed: under review. */
  kind: 'retry' | 'final' | 'appealed';
  /** The administrator's reason, written for the person. */
  reason: string | null;
  /** While an appeal is still possible (plan 0053 Phase 4). */
  appealUntil?: string;
}

/**
 * Another account whose ID has the same number, in `details.matches` of a
 * `409 ID_NUMBER_MATCH`. Never the number and never its hash: the
 * administrator sees which accounts match, not what matched.
 */
export interface IdNumberMatch {
  username: string;
  status: IdVerificationStatus;
  decidedAt: string | null;
}

/** A row in the admin ID queue. No URLs: those are issued only by the detail. */
export interface AdminIdVerificationRow {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  municipality: string | null;
  idType: IdType | null;
  status: IdVerificationStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  /** Flagged in the queue: a suspended account is still reviewed. */
  accountSuspended: boolean;
}

/** The decision on a decided row, for the review page. */
export interface AdminIdDecision {
  status: Exclude<IdVerificationStatus, 'pending'>;
  decidedAt: string;
  /** Null when the administrator's account has since been deleted. */
  decidedBy: string | null;
  reason: string | null;
  /** When the 7 days end: images deleted, no reversal, no appeal after this. */
  windowEndsAt: string;
}

export interface AdminIdAppeal {
  message: string;
  appealedAt: string;
  decidedAt: string | null;
}

export interface AdminIdVerificationDetail {
  id: string;
  userId: string;
  username: string;
  /** As registered — what the ID is checked against. */
  fullName: string;
  birthDate: string;
  age: number;
  municipality: string | null;
  barangay: string | null;
  idType: IdType | null;
  status: IdVerificationStatus;
  submittedAt: string | null;
  /** Signed for minutes; null once the 7 days are over or the images are gone. */
  frontUrl: string | null;
  backUrl: string | null;
  /** When the signed URLs stop working; null when there are none. */
  urlsExpireAt: string | null;
  decision: AdminIdDecision | null;
  appeal: AdminIdAppeal | null;
  /** Whether an ID number was recorded, or recorded as absent. Never the hash. */
  idNumberRecorded: boolean;
  idNumberAbsent: boolean;
}
