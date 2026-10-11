import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { en } from '@/i18n/catalogs/en';
import { ApiError, toApiError } from './api-client';

/** An axios error carrying an API answer, as the client would see it. */
function answered(status: number, body: unknown): AxiosError {
  const response = {
    status,
    data: body,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, response);
}

describe('toApiError', () => {
  it("keeps the server's status, code and details alongside its message", () => {
    const error = toApiError(
      answered(403, {
        error: {
          code: 'ID_DECLINED',
          message: 'Your ID was declined, so this account cannot be used.',
          details: { kind: 'final', reason: 'The address is outside Biliran.' },
        },
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Your ID was declined, so this account cannot be used.');
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe('ID_DECLINED');
    expect((error as ApiError).details).toEqual({ kind: 'final', reason: 'The address is outside Biliran.' });
  });

  it('says browse-only in catalogue copy, not the server sentence', () => {
    const error = toApiError(
      answered(403, { error: { code: 'VERIFICATION_PENDING', message: 'server wording' } }),
    );

    expect(error.message).toBe(en['verification.pending.explain']);
  });

  it('keeps the connection wording for a request that never got an answer', () => {
    const offline = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    const slow = toApiError(new AxiosError('timeout', 'ECONNABORTED'));

    expect(offline).not.toBeInstanceOf(ApiError);
    expect(offline.message).toMatch(/Cannot reach the server/);
    expect(slow.message).toMatch(/timed out/);
  });
});
