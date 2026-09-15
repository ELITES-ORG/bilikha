import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type { ListPublishedParams, ListPublishedResult, PublicProfile } from './types';

interface ApiResponse<T> {
  data: T;
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super('Creative not found.');
    this.name = 'ProfileNotFoundError';
  }
}

export const profileKeys = {
  all: ['profiles'] as const,
  list: (params: ListPublishedParams) => [...profileKeys.all, 'list', params] as const,
  detail: (slug: string) => [...profileKeys.all, 'detail', slug] as const,
};

export function usePublishedProfiles(params: ListPublishedParams) {
  return useQuery({
    queryKey: profileKeys.list(params),
    queryFn: async (): Promise<ListPublishedResult> => {
      try {
        const { data } = await apiClient.get<ListPublishedResult>('/creatives', { params });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function usePublishedProfile(slug: string | undefined) {
  return useQuery({
    queryKey: profileKeys.detail(slug ?? ''),
    queryFn: async (): Promise<PublicProfile> => {
      try {
        const { data } = await apiClient.get<ApiResponse<PublicProfile>>(`/creatives/${slug}`);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) {
          throw new ProfileNotFoundError();
        }
        throw toApiError(error);
      }
    },
    enabled: Boolean(slug),
    retry: false,
  });
}
