import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type { AppNotification } from './types';

interface ApiResponse<T> {
  data: T;
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (page = 1) => ['notifications', 'list', page] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications(page = 1) {
  return useQuery({
    queryKey: notificationKeys.list(page),
    queryFn: async (): Promise<AppNotification[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AppNotification[]>>('/notifications', {
          params: { page },
        });
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * Polled by every signed-in page, so it follows `useUnreadCount` exactly:
 * a minute apart, and `refetchIntervalInBackground: false` so a tab left open
 * in the background stops billing a metered connection for nothing.
 */
export function useNotificationCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: async (): Promise<number> => {
      try {
        const { data } = await apiClient.get<ApiResponse<{ count: number }>>(
          '/notifications/unread-count',
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

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await apiClient.post(`/notifications/${id}/read`);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/notifications/read-all');
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
