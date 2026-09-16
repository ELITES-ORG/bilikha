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

export interface RegisterPayload {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  password: string;
  confirmPassword: string;
  privacyConsent: true;
  termsAccepted: true;
}
