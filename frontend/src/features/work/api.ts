import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { WorkSummary } from '@contracts/work';
import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

export class WorkNotFoundError extends Error {
  constructor() {
    super('No creative profile.');
    this.name = 'WorkNotFoundError';
  }
}

export const workKeys = {
  all: ['me', 'work'] as const,
  summary: () => [...workKeys.all, 'summary'] as const,
};

export function useWorkSummary(enabled = true) {
  return useQuery({
    queryKey: workKeys.summary(),
    enabled,
    queryFn: async (): Promise<WorkSummary> => {
      try {
        const { data } = await apiClient.get<ApiResponse<WorkSummary>>('/me/work');
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) {
          throw new WorkNotFoundError();
        }
        throw toApiError(error);
      }
    },
  });
}
