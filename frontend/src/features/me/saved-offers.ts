import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { SavedOfferItem } from '@contracts/me';
import { apiClient, toApiError } from '@/lib/api-client';

export type { SavedOfferItem };

interface ApiResponse<T> {
  data: T;
}

/** One row from GET /me/saved-offers — see `@contracts/me`. */

export const savedOfferKeys = {
  all: ['me', 'saved-offers'] as const,
  list: () => [...savedOfferKeys.all, 'list'] as const,
};

function rethrowForForms(error: unknown): never {
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useSavedOffers(enabled = true) {
  return useQuery({
    queryKey: savedOfferKeys.list(),
    queryFn: async (): Promise<SavedOfferItem[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<SavedOfferItem[]>>('/me/saved-offers');
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled,
  });
}

export function useSaveOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (offerId: string) => {
      try {
        const { data } = await apiClient.post<ApiResponse<unknown>>('/me/saved-offers', {
          offerId,
        });
        return data.data;
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedOfferKeys.all });
    },
  });
}

export function useUnsaveOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (offerId: string) => {
      try {
        await apiClient.delete(`/me/saved-offers/${offerId}`);
      } catch (error) {
        rethrowForForms(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedOfferKeys.all });
    },
  });
}
