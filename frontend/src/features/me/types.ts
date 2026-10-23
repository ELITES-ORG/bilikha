/**
 * Account hub types. Response shapes live in `@contracts/me` (ADR 0037).
 * Form payloads stay here.
 */

import type {
  ContactPreference,
  OwnProfile as ContractOwnProfile,
  OwnProfileStatus,
  SavedOfferItem,
} from '@contracts/me';
import type { ProfileCover } from '@contracts/profiles';

export type { ContactPreference, ProfileCover, SavedOfferItem };

export type OwnProfile = Omit<ContractOwnProfile, 'cover' | 'pendingCover' | 'coverRejectionReason'> & {
  // Optional because the two tiers deploy independently: the frontend can be
  // live on Vercel while Render is still serving a payload without these
  // (ADR 0040). Reading them unguarded would break the profile editor.
  cover?: ProfileCover | null;
  pendingCover?: ProfileCover | null;
  coverRejectionReason?: string | null;
};
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
