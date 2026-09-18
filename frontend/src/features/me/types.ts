/**
 * Account hub types. Response shapes live in `@contracts/me` (ADR 0037).
 * Form payloads stay here.
 */

import type {
  ContactPreference,
  OwnProfile,
  OwnProfileStatus,
  SavedOfferItem,
} from '@contracts/me';

export type { ContactPreference, OwnProfile, SavedOfferItem };
export type ProfileStatus = OwnProfileStatus;

export interface UpdateProfilePayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  displayName?: string;
  bio?: string;
  municipalitySlug: string;
  barangaySlug?: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  contactPreference: ContactPreference;
}

export interface CreateProfilePayload {
  displayName?: string;
  bio?: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  contactPreference: ContactPreference;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
