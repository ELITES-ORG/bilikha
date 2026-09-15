export interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  profileSlug: string | null;
  profileStatus: string | null;
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
  barangaySlug?: string;
  password: string;
  confirmPassword: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  privacyConsent: true;
  termsAccepted: true;
}
