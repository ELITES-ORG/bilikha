import { useQuery } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type { CreativeDomain, Municipality } from './types';

interface ApiResponse<T> {
  data: T;
}

export const taxonomyKeys = {
  all: ['taxonomy'] as const,
  domains: () => [...taxonomyKeys.all, 'domains'] as const,
  municipalities: () => [...taxonomyKeys.all, 'municipalities'] as const,
};

async function fetchDomains(): Promise<CreativeDomain[]> {
  try {
    const { data } = await apiClient.get<ApiResponse<CreativeDomain[]>>('/taxonomy/domains');
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

async function fetchMunicipalities(): Promise<Municipality[]> {
  try {
    const { data } = await apiClient.get<ApiResponse<Municipality[]>>('/taxonomy/municipalities');
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export function useCreativeDomains() {
  return useQuery({
    queryKey: taxonomyKeys.domains(),
    queryFn: fetchDomains,
    // Reference data. Refetching it on a metered connection is pure waste.
    staleTime: Infinity,
  });
}

export function useMunicipalities() {
  return useQuery({
    queryKey: taxonomyKeys.municipalities(),
    queryFn: fetchMunicipalities,
    staleTime: Infinity,
  });
}

export interface Barangay {
  id: string;
  slug: string;
  name: string;
}

export function useBarangays(municipalitySlug: string | undefined) {
  return useQuery({
    queryKey: [...taxonomyKeys.all, 'barangays', municipalitySlug],
    queryFn: async (): Promise<Barangay[]> => {
      const { data } = await apiClient.get<{ data: Barangay[] }>(
        `/taxonomy/municipalities/${municipalitySlug}/barangays`,
      );
      return data.data;
    },
    enabled: Boolean(municipalitySlug),
    staleTime: Infinity,
  });
}
