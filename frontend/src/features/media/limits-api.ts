import { useQuery } from '@tanstack/react-query';
import type { MediaKind, MediaLimits, MediaUsage, UploadTicket, UploadTicketBody } from '@contracts/media';
import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

export const mediaKeys = {
  all: ['media'] as const,
  limits: () => [...mediaKeys.all, 'limits'] as const,
  usage: () => [...mediaKeys.all, 'usage'] as const,
};

/**
 * The limits, or `available: false` while they load and whenever they cannot
 * be read. An older backend has no `/media/limits`, and the editor then falls
 * back to images only.
 */
export type MediaLimitsState =
  | { available: true; limits: MediaLimits }
  | { available: false; loading: boolean };

async function fetchLimits(): Promise<MediaLimits> {
  try {
    const { data } = await apiClient.get<ApiResponse<MediaLimits>>('/media/limits');
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

async function fetchUsage(): Promise<MediaUsage> {
  try {
    const { data } = await apiClient.get<ApiResponse<MediaUsage>>('/media/usage');
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export function useMediaLimits(): MediaLimitsState {
  const query = useQuery({
    queryKey: mediaKeys.limits(),
    queryFn: fetchLimits,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (query.data) return { available: true, limits: query.data };
  return { available: false, loading: query.isPending };
}

export function useMediaUsage() {
  return useQuery({
    queryKey: mediaKeys.usage(),
    queryFn: fetchUsage,
  });
}

/** Reserves room for one upload and returns where to send it. */
export async function requestUploadTicket(body: UploadTicketBody): Promise<UploadTicket> {
  try {
    const { data } = await apiClient.post<ApiResponse<UploadTicket>>('/media/uploads', body);
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Gives a reservation back, after a cancel or a failure. */
export async function abandonUploadTicket(reservationId: string): Promise<void> {
  try {
    await apiClient.delete(`/media/uploads/${encodeURIComponent(reservationId)}`);
  } catch (error) {
    throw toApiError(error);
  }
}

export interface AttachOfferMediaBody {
  reservationId: string;
  title?: string;
}

/** Attaches a finished upload to the offer. */
export async function attachOfferMedia(
  offerId: string,
  body: AttachOfferMediaBody,
): Promise<{ id: string; kind: MediaKind }> {
  try {
    const { data } = await apiClient.post<ApiResponse<{ id: string; kind: MediaKind }>>(
      `/offers/${encodeURIComponent(offerId)}/media`,
      body,
    );
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}
