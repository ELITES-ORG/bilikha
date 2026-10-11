import axios, { AxiosError } from 'axios';
import { clearLastSession } from '@/features/auth/session-cache';
import { storeDeclineNotice } from '@/features/verification/status';
import { en } from '@/i18n/catalogs/en';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15_000,
  // Sessions will be cookie-based; sending credentials from the start avoids a
  // confusing "works in dev, 401s in prod" moment once auth lands.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * An answer from the API, keeping what the server said about it. The message is
 * the one worth showing; `code` and `details` let a screen act on the kind of
 * refusal — a decline's reason, a browse-only account — without parsing text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * An ID declined mid-session (ADR 0057): the server has already ended the
 * session. Keep its reason for the sign-in screen and go there with a full
 * page load, so nothing signed-in stays on screen or in memory. Only this one
 * answer: every other 401 is the ordinary signed-out state, which the screens
 * handle themselves.
 */
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (error instanceof AxiosError && error.response?.status === 401) {
    const body = error.response.data as ApiErrorBody | undefined;
    if (body?.error?.code === 'ID_DECLINED') {
      storeDeclineNotice(body.error.details);
      clearLastSession();
      window.location.assign('/login');
    }
  }
  return Promise.reject(error);
});

/**
 * Normalises everything the UI might catch into an Error with a message worth
 * showing a user. Connections in Biliran are frequently slow or dropped, so the
 * network and timeout cases get their own wording rather than falling through
 * to a generic failure. An API answer becomes an `ApiError`, which keeps its
 * status, code and details.
 */
export function toApiError(error: unknown): Error {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED') {
      return new Error('The request timed out. Please check your connection and try again.');
    }
    if (!error.response) {
      return new Error('Cannot reach the server. Please check your connection.');
    }
    const body = error.response.data as ApiErrorBody | undefined;
    const code = body?.error?.code ?? 'UNKNOWN';
    // Catalogue copy rather than the server's sentence, so it can be translated
    // (ADR 0055). English until a translation exists; screens that know the
    // chosen language explain the gate themselves before it is ever hit.
    const message =
      code === 'VERIFICATION_PENDING'
        ? en['verification.pending.explain']
        : (body?.error?.message ?? `Request failed with status ${error.response.status}`);
    return new ApiError(message, error.response.status, code, body?.error?.details);
  }
  return error instanceof Error ? error : new Error('An unexpected error occurred');
}
