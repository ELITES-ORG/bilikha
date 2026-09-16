import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { authKeys } from '@/features/auth/api';
import { apiClient, toApiError } from '@/lib/api-client';
import type { ChangePasswordPayload, CreateProfilePayload, OwnProfile, UpdateProfilePayload } from './types';

interface ApiResponse<T> {
  data: T;
}

export const meKeys = {
  all: ['me'] as const,
  profile: () => [...meKeys.all, 'profile'] as const,
};

export function useOwnProfile() {
  return useQuery({
    queryKey: meKeys.profile(),
    queryFn: async (): Promise<OwnProfile | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<OwnProfile | null>>('/me/profile');
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useCreateOwnProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateProfilePayload): Promise<OwnProfile> => {
      try {
        const { data } = await apiClient.post<ApiResponse<OwnProfile>>('/me/profile', payload);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError) throw error;
        throw toApiError(error);
      }
    },
    onSuccess: async (profile) => {
      queryClient.setQueryData(meKeys.profile(), profile);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.profile() }),
        queryClient.invalidateQueries({ queryKey: authKeys.me }),
      ]);
    },
  });
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateProfilePayload): Promise<OwnProfile> => {
      try {
        const { data } = await apiClient.put<ApiResponse<OwnProfile>>('/me/profile', payload);
        return data.data;
      } catch (error) {
        // Keep AxiosError so the form can map validation details to fields.
        if (error instanceof AxiosError) throw error;
        throw toApiError(error);
      }
    },
    onSuccess: async (profile) => {
      queryClient.setQueryData(meKeys.profile(), profile);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKeys.profile() }),
        queryClient.invalidateQueries({ queryKey: authKeys.me }),
      ]);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload): Promise<void> => {
      try {
        await apiClient.post('/me/password', payload);
      } catch (error) {
        // Keep AxiosError so the form can map validation and 401 responses.
        if (error instanceof AxiosError) throw error;
        throw toApiError(error);
      }
    },
  });
}
