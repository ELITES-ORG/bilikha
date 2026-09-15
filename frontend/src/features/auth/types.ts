export interface AuthUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  profileSlug: string | null;
  profileStatus: string | null;
  rejectionReason: string | null;
}

export interface CreativeRegisterPayload {
  kind?: 'creative';
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

export interface ClientRegisterPayload {
  kind: 'client';
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  password: string;
  confirmPassword: string;
  privacyConsent: true;
  termsAccepted: true;
}

export type RegisterPayload = CreativeRegisterPayload | ClientRegisterPayload;
