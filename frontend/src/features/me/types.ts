export type ProfileStatus = 'draft' | 'pending_review' | 'published' | 'suspended';
export type ContactPreference = 'phone' | 'email';

export interface OwnProfile {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  displayName: string | null;
  bio: string | null;
  municipalitySlug: string | null;
  barangaySlug: string | null;
  contactPreference: ContactPreference;
  email: string;
  phone: string;
  status: ProfileStatus;
  rejectionReason: string | null;
  editedSinceReviewAt: string | null;
  subdomainSlugs: string[];
  primarySubdomainSlug: string | null;
}

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
  municipalitySlug: string;
  barangaySlug?: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  contactPreference: ContactPreference;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
