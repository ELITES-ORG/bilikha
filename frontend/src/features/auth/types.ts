export interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  municipalitySlug: string | null;
  municipalityName: string | null;
  profileSlug: string | null;
  profileStatus: string | null;
  rejectionReason: string | null;
  avatarUrl: string | null;
}

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
