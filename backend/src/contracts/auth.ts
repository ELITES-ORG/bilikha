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
  avatarUrl: string | null;
  /** An administrator reset this password; nothing works until it is changed. */
  mustChangePassword: boolean;
}
