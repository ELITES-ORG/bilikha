import { AxiosError } from 'axios';

/**
 * Turns the API's validation envelope into a map keyed by field name, so each
 * input can render its own message instead of one banner listing everything.
 */
export function toFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AxiosError) || !error.response) return {};

  const body = error.response.data as {
    error?: { details?: unknown; message?: string };
  };
  const details = body.error?.details;

  if (Array.isArray(details)) {
    const map: Record<string, string> = {};
    for (const item of details as { path?: string; message?: string }[]) {
      if (item.path && item.message && !map[item.path]) map[item.path] = item.message;
    }
    return map;
  }

  if (details && typeof details === 'object' && 'field' in details) {
    const field = String((details as { field: unknown }).field);
    return { [field]: body.error?.message ?? 'Invalid value' };
  }

  return {};
}
