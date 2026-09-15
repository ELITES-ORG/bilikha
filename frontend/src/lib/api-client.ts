import axios, { AxiosError } from 'axios';

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
 * Normalises everything the UI might catch into a plain Error with a message
 * worth showing a user. Connections in Biliran are frequently slow or dropped,
 * so the network and timeout cases get their own wording rather than falling
 * through to a generic failure.
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
    return new Error(body?.error?.message ?? `Request failed with status ${error.response.status}`);
  }
  return error instanceof Error ? error : new Error('An unexpected error occurred');
}
