import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AdminSummary } from '@contracts/admin';
import type {
  AdminIdVerificationDetail,
  AdminIdVerificationRow,
} from '@contracts/verification';
import type { Paginated } from '@contracts/pagination';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  AdminAccount,
  AdminProfileDetail,
  AdminQueueMeta,
  AdminQueueRow,
  IdDecisionPayload,
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
  summary: () => [...adminKeys.all, 'summary'] as const,
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

/**
 * What waits for a decision under each admin subject (ADR 0059): the sidebar's
 * badges and each page's tab counts.
 */
export function useAdminSummary() {
  return useQuery({
    queryKey: adminKeys.summary(),
    queryFn: async (): Promise<AdminSummary> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AdminSummary>>('/admin/summary');
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * Re-reads the summary whenever the admin area's writes settle. Every decision
 * — a profile, an organisation, an offer, a report — changes what is waiting,
 * and this keeps the badges true without each of those mutations having to
 * know the sidebar exists.
 */
export function useSummaryFollowsDecisions() {
  const queryClient = useQueryClient();
  const mutating = useIsMutating();
  const was = useRef(mutating);
  useEffect(() => {
    if (was.current > 0 && mutating === 0) {
      void queryClient.invalidateQueries({ queryKey: adminKeys.summary() });
    }
    was.current = mutating;
  }, [mutating, queryClient]);
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

/**
 * Issues a temporary password (ADR 0051).
 *
 * `retry: false` is load-bearing, not caution: every call mints a new password
 * and invalidates the one before it, so an automatic retry would show the
 * administrator a password that no longer works. Nothing caches the response
 * either — it is the only time the password is readable.
 */
export function useResetAccountPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: async (input: {
      userId: string;
    }): Promise<{ username: string; temporaryPassword: string }> => {
      try {
        const { data } = await apiClient.post<
          ApiResponse<{ id: string; username: string; temporaryPassword: string }>
        >(`/admin/accounts/${input.userId}/reset-password`);
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    // The account's sessions are gone, which the queues and counts can reflect.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
}

/* --- ID review (ADR 0057, plan 0053 Phase 3) ------------------------------ */

export const adminIdKeys = {
  all: ['admin', 'ids'] as const,
  queue: (view: 'pending' | 'decided', page: number) => [...adminIdKeys.all, 'queue', view, page] as const,
  detail: (id: string) => [...adminIdKeys.all, 'detail', id] as const,
};

export function useAdminIdQueue(view: 'pending' | 'decided', page: number) {
  return useQuery({
    queryKey: adminIdKeys.queue(view, page),
    queryFn: async (): Promise<Paginated<AdminIdVerificationRow>> => {
      try {
        const { data } = await apiClient.get<Paginated<AdminIdVerificationRow>>(
          '/admin/id-verifications',
          { params: { view, page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * One ID, with links that last minutes. Never cached and never prefetched: a
 * link kept in memory would outlive what it was signed for, and every fetch is
 * a look the server records against this administrator.
 */
export function useAdminIdVerification(id: string | undefined) {
  return useQuery({
    queryKey: adminIdKeys.detail(id ?? ''),
    enabled: Boolean(id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AdminIdVerificationDetail> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AdminIdVerificationDetail>>(
          `/admin/id-verifications/${id}`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useDecideIdVerification(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: IdDecisionPayload): Promise<AdminIdVerificationDetail> => {
      try {
        const { data } = await apiClient.post<ApiResponse<AdminIdVerificationDetail>>(
          `/admin/id-verifications/${id}/decision`,
          payload,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminIdKeys.all }),
  });
}
