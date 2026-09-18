import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type {
  OfferImage,
  ProfileOffer,
  PublishedOfferCard,
  PublishedOfferCreative,
  PublishedOfferDetail,
} from '@contracts/offers';
import { apiClient, toApiError } from '@/lib/api-client';

export type {
  OfferImage,
  ProfileOffer,
  PublishedOfferCard,
  PublishedOfferCreative,
  PublishedOfferDetail,
};

interface ApiResponse<T> {
  data: T;
}

export type OwnOffer = {
  id: string;
  title: string;
  description: string | null;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  sortOrder: number;
  flaggedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subdomainSlug: string;
  subdomainName: string;
  domainName: string;
  images: OfferImage[];
};

export type OfferWriteInput = {
  title: string;
  subdomainSlug: string;
  // null clears the field on update; undefined leaves it unchanged.
  description?: string | null;
  priceMinCentavos?: number | null;
  priceMaxCentavos?: number | null;
};

export type ListOffersParams = {
  domain?: string;
  subdomain?: string;
  municipality?: string;
  /** Pesos (not centavos) — matches the public query string. */
  budgetMin?: number;
  budgetMax?: number;
  page?: number;
  limit?: number;
};

export type ListOffersResult = {
  data: PublishedOfferCard[];
  meta: { page: number; limit: number; total: number };
};

export class OfferNotFoundError extends Error {
  constructor() {
    super('Offer not found.');
    this.name = 'OfferNotFoundError';
  }
}

export const offerKeys = {
  all: ['offers'] as const,
  mine: () => [...offerKeys.all, 'mine'] as const,
  list: (params: ListOffersParams) => [...offerKeys.all, 'list', params] as const,
  detail: (id: string) => [...offerKeys.all, 'detail', id] as const,
};

export async function listMine(): Promise<OwnOffer[]> {
  try {
    const { data } = await apiClient.get<ApiResponse<OwnOffer[]>>('/offers/mine');
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Hub summary only — count, not the editor. */
export function useOwnOffers(enabled = true) {
  return useQuery({
    queryKey: offerKeys.mine(),
    queryFn: listMine,
    enabled,
  });
}

export async function createOffer(input: OfferWriteInput): Promise<OwnOffer> {
  try {
    const { data } = await apiClient.post<ApiResponse<OwnOffer>>('/offers', input);
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateOffer(id: string, input: OfferWriteInput): Promise<OwnOffer> {
  try {
    const { data } = await apiClient.patch<ApiResponse<OwnOffer>>(`/offers/${id}`, input);
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteOffer(id: string): Promise<void> {
  try {
    await apiClient.delete(`/offers/${id}`);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function reorderOffers(ids: string[]): Promise<OwnOffer[]> {
  try {
    const { data } = await apiClient.put<ApiResponse<OwnOffer[]>>('/offers/order', { ids });
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function addOfferImage(
  offerId: string,
  input: { objectKey: string; thumbKey: string },
): Promise<OfferImage> {
  try {
    const { data } = await apiClient.post<ApiResponse<OfferImage>>(
      `/offers/${offerId}/images`,
      input,
    );
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteOfferImage(imageId: string): Promise<void> {
  try {
    await apiClient.delete(`/offers/images/${imageId}`);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listPublished(params: ListOffersParams): Promise<ListOffersResult> {
  try {
    const { data } = await apiClient.get<ListOffersResult>('/offers', { params });
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getPublished(id: string): Promise<PublishedOfferDetail> {
  try {
    const { data } = await apiClient.get<ApiResponse<PublishedOfferDetail>>(`/offers/${id}`);
    return data.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      throw new OfferNotFoundError();
    }
    throw toApiError(error);
  }
}

export function usePublishedOffers(params: ListOffersParams, enabled = true) {
  return useQuery({
    queryKey: offerKeys.list(params),
    queryFn: () => listPublished(params),
    enabled,
  });
}

export function usePublishedOffer(id: string | undefined) {
  return useQuery({
    queryKey: offerKeys.detail(id ?? ''),
    queryFn: () => getPublished(id!),
    enabled: Boolean(id),
    retry: false,
  });
}
