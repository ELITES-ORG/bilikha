import type { PublicUser } from '@contracts/auth';

export type ViewMode = 'hiring' | 'creative';

/** Session user — same wire shape as `PublicUser` (ADR 0037). */
export type AuthUser = PublicUser;

export interface RegisterPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  municipalitySlug: string;
  barangaySlug: string;
  password: string;
  confirmPassword: string;
  privacyConsent: true;
  termsAccepted: true;
}
