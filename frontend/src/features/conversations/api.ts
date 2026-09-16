import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  ConversationListItem,
  ConversationThread,
  HistoryItem,
  StartConversationPayload,
  StartConversationResult,
} from './types';

interface ApiResponse<T> {
  data: T;
}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (page = 1) => ['conversations', 'list', page] as const,
  thread: (id: string, after?: string) =>
    ['conversations', 'thread', id, after ?? ''] as const,
  unread: ['conversations', 'unread'] as const,
  history: ['conversations', 'history'] as const,
};

function rethrowForForms(error: unknown): never {
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useConversationThreads(page = 1) {
  return useQuery({
    queryKey: conversationKeys.list(page),
    queryFn: async (): Promise<{ data: ConversationListItem[]; meta: ListMeta }> => {
      try {
        const { data } = await apiClient.get<{ data: ConversationListItem[]; meta: ListMeta }>(
          '/conversations',
          { params: { page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useConversationThread(id: string | undefined, poll = false) {
  return useQuery({
    queryKey: conversationKeys.thread(id ?? ''),
    queryFn: async (): Promise<ConversationThread> => {
      try {
        const { data } = await apiClient.get<ApiResponse<ConversationThread>>(
          `/conversations/${id}`,
          { params: { limit: 100 } },
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled: Boolean(id),
    refetchInterval: poll ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: conversationKeys.unread,
    queryFn: async (): Promise<number> => {
      try {
        const { data } = await apiClient.get<ApiResponse<{ count: number }>>(
          '/conversations/unread-count',
        );
        return data.data.count;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useHistory() {
  return useQuery({
    queryKey: conversationKeys.history,
    queryFn: async (): Promise<HistoryItem[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<HistoryItem[]>>(
          '/conversations/history',
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: StartConversationPayload) => {
      try {
        const { data } = await apiClient.post<ApiResponse<StartConversationResult>>(
          '/conversations',
          payload,
        );
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.history });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<unknown>>(
          `/conversations/${conversationId}/messages`,
          { body },
        );
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.thread(conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.unread });
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<{ ok: boolean }>>(
          `/conversations/${id}/read`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.thread(id) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.unread });
    },
  });
}

export function useReportConversation(conversationId: string) {
  return useMutation({
    mutationFn: async (reason: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<{ id: string; status: string }>>(
          `/conversations/${conversationId}/report`,
          { reason },
        );
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<unknown>>('/me/blocks', { userId });
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}
