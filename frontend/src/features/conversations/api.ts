import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type { ViewMode } from '@/features/auth/types';
import type {
  ConversationListItem,
  ConversationThread,
  CreativeHistoryItem,
  EnsureConversationPayload,
  EnsureConversationResult,
  HistoryItem,
  SendMessagePayload,
  StartConversationPayload,
  StartConversationResult,
} from './types';
import type { ListMeta } from '@contracts/pagination';

interface ApiResponse<T> {
  data: T;
}

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (mode: ViewMode, page = 1) => ['conversations', 'list', mode, page] as const,
  thread: (id: string, after?: string) =>
    ['conversations', 'thread', id, after ?? ''] as const,
  unread: ['conversations', 'unread'] as const,
  history: (mode: ViewMode) => ['conversations', 'history', mode] as const,
};

function rethrowForForms(error: unknown): never {
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useConversationThreads(mode: ViewMode, page = 1) {
  return useQuery({
    queryKey: conversationKeys.list(mode, page),
    queryFn: async (): Promise<{ data: ConversationListItem[]; meta: ListMeta }> => {
      try {
        const { data } = await apiClient.get<{ data: ConversationListItem[]; meta: ListMeta }>(
          '/conversations',
          { params: { mode, page, limit: 20 } },
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

export function useHistory(mode: ViewMode) {
  return useQuery({
    queryKey: conversationKeys.history(mode),
    queryFn: async (): Promise<HistoryItem[] | CreativeHistoryItem[]> => {
      try {
        const { data } = await apiClient.get<
          ApiResponse<HistoryItem[] | CreativeHistoryItem[]>
        >('/conversations/history', { params: { mode } });
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useEnsureConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: EnsureConversationPayload): Promise<EnsureConversationResult> => {
      try {
        const { data } = await apiClient.post<ApiResponse<EnsureConversationResult>>(
          '/conversations/ensure',
          payload,
        );
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
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'history'] });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      try {
        const { data } = await apiClient.post<ApiResponse<unknown>>(
          `/conversations/${conversationId}/messages`,
          payload,
        );
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.thread(conversationId) });
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.unread });
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'history'] });
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
      void queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
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
