import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

/** One row from GET /me/saved-offers. */
export type SavedOfferItem = {
  id: string;
  savedAt?: string;
  createdAt?: string;
  offer: {
    id: string;
    title: string;
    priceMinCentavos: number | null;
    priceMaxCentavos: number | null;
    image: { url?: string; thumbUrl: string } | null;
  };
  creative: {
    slug: string;
    displayName: string;
    municipality?: string;
    avatarUrl?: string | null;
  };
};

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
