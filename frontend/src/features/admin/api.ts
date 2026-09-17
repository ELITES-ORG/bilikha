import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  AdminAccount,
  AdminProfileDetail,
  AdminQueueMeta,
  AdminQueueRow,
  ModeratePayload,
  ProfileStatus,
  QueueStatus,
} from './types';

interface ApiResponse<T> {
  data: T;
}

interface ListResponse {
  data: AdminQueueRow[];
  meta: AdminQueueMeta;
}

export const adminKeys = {
  all: ['admin'] as const,
  lists: () => [...adminKeys.all, 'list'] as const,
  list: (status: QueueStatus, page: number) =>
    [...adminKeys.lists(), status, page] as const,
  counts: () => [...adminKeys.all, 'counts'] as const,
  detail: (id: string) => [...adminKeys.all, 'detail', id] as const,
};

export function useAdminProfiles(status: QueueStatus, page: number) {
  return useQuery({
    queryKey: adminKeys.list(status, page),
    queryFn: async (): Promise<ListResponse> => {
      try {
        const { data } = await apiClient.get<ListResponse>('/admin/profiles', {
          params: { status, page, limit: 20 },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useAdminCounts() {
  return useQuery({
    queryKey: adminKeys.counts(),
    queryFn: async (): Promise<Record<string, number>> => {
      try {
        const { data } = await apiClient.get<ApiResponse<Record<string, number>>>(
          '/admin/profiles/counts',
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useAdminProfile(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<AdminProfileDetail> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AdminProfileDetail>>(
          `/admin/profiles/${id}`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useModerateProfile(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ModeratePayload) => {
      try {
        const { data } = await apiClient.post<ApiResponse<{ id: string; status: ProfileStatus }>>(
          `/admin/profiles/${id}/moderate`,
          payload,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.counts() }),
        queryClient.invalidateQueries({ queryKey: adminKeys.detail(id) }),
      ]);
    },
  });
}

export const adminAccountKeys = {
  search: (q: string) => ['admin', 'accounts', q] as const,
};

/** Lookup, not a browsable list — you come here with a person in mind. */
export function useAccountSearch(query: string) {
  return useQuery({
    queryKey: adminAccountKeys.search(query),
    queryFn: async (): Promise<AdminAccount[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AdminAccount[]>>('/admin/accounts', {
          params: { q: query },
        });
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled: query.trim().length >= 2,
  });
}

export function useSetAccountStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      userId: string;
      action: 'suspend' | 'reinstate';
      reason?: string;
    }): Promise<void> => {
      try {
        await apiClient.post(`/admin/accounts/${input.userId}/status`, {
          action: input.action,
          reason: input.reason,
        });
      } catch (error) {
        throw toApiError(error);
      }
    },
    // Suspension changes what the queues show, not just this row.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}
