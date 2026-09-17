import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type { AuthUser, RegisterPayload } from './types';

interface ApiResponse<T> {
  data: T;
}

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** 401 is the normal signed-out state, not an error worth retrying or showing. */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
        return data.data;
      } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 401) {
          return null;
        }
        throw toApiError(error);
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
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
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
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
    onSuccess: (user) => queryClient.setQueryData(authKeys.me, user),
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
      navigate('/', { replace: true });
      queryClient.clear();
    },
  });
}
