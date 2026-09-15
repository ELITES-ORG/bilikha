import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type { ReceivedInquiry, RespondPayload, SendInquiryPayload, SentInquiry } from './types';

interface ApiResponse<T> {
  data: T;
}

interface ListMeta {
  page: number;
  limit: number;
  total: number;
}

export const inquiryKeys = {
  all: ['inquiries'] as const,
  received: (page = 1) => [...inquiryKeys.all, 'received', page] as const,
  sent: (page = 1) => [...inquiryKeys.all, 'sent', page] as const,
};

function rethrowForForms(error: unknown): never {
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useSendInquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SendInquiryPayload) => {
      try {
        const { data } = await apiClient.post<ApiResponse<unknown>>('/inquiries', payload);
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inquiryKeys.all });
    },
  });
}

export function useReceivedInquiries(page = 1, enabled = true) {
  return useQuery({
    queryKey: inquiryKeys.received(page),
    queryFn: async (): Promise<{ data: ReceivedInquiry[]; meta: ListMeta }> => {
      try {
        const { data } = await apiClient.get<{ data: ReceivedInquiry[]; meta: ListMeta }>(
          '/inquiries/received',
          { params: { page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled,
  });
}

export function useSentInquiries(page = 1) {
  return useQuery({
    queryKey: inquiryKeys.sent(page),
    queryFn: async (): Promise<{ data: SentInquiry[]; meta: ListMeta }> => {
      try {
        const { data } = await apiClient.get<{ data: SentInquiry[]; meta: ListMeta }>(
          '/inquiries/sent',
          { params: { page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useMarkInquiryRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<{ id: string; status: string }>>(
          `/inquiries/${id}/read`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inquiryKeys.all });
    },
  });
}

export function useRespondToInquiry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: RespondPayload & { id: string }) => {
      try {
        const { data } = await apiClient.post(`/inquiries/${id}/respond`, payload);
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inquiryKeys.all });
    },
  });
}
