import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import { clearLastSession, readLastSession, writeLastSession } from './session-cache';
import type { AuthUser, RegisterPayload } from './types';

interface ApiResponse<T> {
  data: T;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/**
 * 401 is the normal signed-out state, not an error worth retrying or showing.
 *
 * Seeded from `readLastSession()` so the app can paint immediately instead of
 * waiting on a round trip that takes a minute when the API is asleep. The hint
 * shortens the blank; it never replaces the check.
 *
 * `placeholderData` and **not** `initialData`. Initial data is written into the
 * cache as though the server had said it, and then obeys `staleTime` like any
 * other answer — a seeded query can go a whole session without asking, which
 * would leave a signed-out person looking at a signed-in shell. Placeholder
 * data is never cached and never satisfies a fetch, so the request always goes
 * out and the hint is only ever what is on screen while it is in flight.
 */
export function useCurrentUser() {
  const seed = readLastSession();

  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        // 75s, not the client's usual 15s. This one request has to survive the
        // API waking from sleep, which Render puts at about a minute. At 15s it
        // aborted instead, the query errored, and the guard read "no user" and
        // sent people to /login — the app signed you out for the server having
        // been idle. Ordinary requests keep the short timeout: by the time they
        // run, something has already woken the server.
        const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me', {
          timeout: 75_000,
        });
        return data.data;
      } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 401) {
          return null;
        }
        // A network failure is not an answer. `useRememberSession` leaves the
        // hint alone in that case — a phone that lost signal has not been
        // signed out.
        throw toApiError(error);
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...(seed !== undefined ? { placeholderData: seed } : {}),
  });

  /**
   * A failed request is not a sign-out.
   *
   * `placeholderData` disappears the moment the query errors, which would leave
   * every guard seeing "nobody" and redirecting to /login because a phone went
   * through a tunnel. Where this device remembers a session, keep painting it
   * and let the next successful answer decide. The server still authorises
   * every request, so the worst case is a shell and some 401s.
   */
  const user = query.isError && seed !== undefined ? seed : (query.data ?? null);

  return { ...query, data: user };
}

/**
 * Keeps the device hint in step with what the server actually said.
 *
 * Mounted once, in `App`. This was originally done inside the query function,
 * which was wrong twice over: a query function runs per fetch rather than per
 * answer, and it does not run at all for a cached read — so the hint drifted
 * from the truth in exactly the case that matters, a session that has expired.
 * Writing it here means it happens when, and only when, an authoritative answer
 * lands.
 */
export function useRememberSession(): void {
  const { data, isSuccess, isPlaceholderData } = useCurrentUser();

  useEffect(() => {
    // A placeholder is the hint being read back, not the server speaking.
    if (!isSuccess || isPlaceholderData) return;
    if (data) writeLastSession(data);
    else clearLastSession();
  }, [data, isSuccess, isPlaceholderData]);
}

function rethrowForForms(error: unknown): never {
  // Keep AxiosError so RegisterPage can map per-field messages via toFieldErrors.
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: RegisterPayload): Promise<AuthUser> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AuthUser>>('/auth/register', payload);
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: (user) => {
      writeLastSession(user);
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { username: string; password: string }): Promise<AuthUser> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AuthUser>>('/auth/login', input);
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (user) => {
      writeLastSession(user);
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      try {
        await apiClient.post('/auth/logout');
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      /**
       * Navigate first, then clear.
       *
       * Signing out used to leave you where you were and rely on RequireAuth
       * to bounce you. That races: clearing the cache makes the page you are
       * still on refetch, so the account page rendered "Could not load your
       * profile — you must be signed in" before the guard moved. And the guard
       * sends you to /login, which is not where someone who just chose to sign
       * out wants to be.
       *
       * Leaving the page first unmounts those queries, so the clear that
       * follows has no observers left to refetch and nothing flashes.
       */
      // Forget the device hint first: a cleared query cache would otherwise
      // reseed itself from it on the next render and paint a signed-in shell
      // for somebody who just signed out.
      clearLastSession();
      navigate('/', { replace: true });
      queryClient.clear();
    },
  });
}
