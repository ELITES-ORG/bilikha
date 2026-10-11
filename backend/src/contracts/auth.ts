import type { OwnIdVerification } from './verification.js';

/**
 * Session / identity payload returned by register, login, and /me bootstrap.
 */

export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  viewMode: 'hiring' | 'creative';
  municipalitySlug: string | null;
  municipalityName: string | null;
  profileSlug: string | null;
  profileStatus: string | null;
  rejectionReason: string | null;
  /** The approved photo: what everyone else sees. */
  avatarUrl: string | null;
  /** A new photo waiting for review, seen only by its owner (ADR 0058). */
  pendingAvatarUrl: string | null;
  /** Why the last new photo was not approved; cleared by the next upload. */
  avatarRejectionReason: string | null;
  /** An administrator reset this password; nothing works until it is changed. */
  mustChangePassword: boolean;
  /**
   * The account's ID verification (ADR 0057). Null when none is required —
   * every account that existed before it shipped. Never a key or a URL.
   */
  idVerification: OwnIdVerification | null;
}
