import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  ListPostingsParams,
  ListPostingsResult,
  Posting,
  PostingPatchInput,
  PostingWriteInput,
} from './types';

interface ApiResponse<T> {
  data: T;
}

export class PostingNotFoundError extends Error {
  constructor() {
    super('Posting not found.');
    this.name = 'PostingNotFoundError';
  }
}

export const postingKeys = {
  all: ['postings'] as const,
  mine: () => [...postingKeys.all, 'mine'] as const,
  feed: (params: ListPostingsParams) => [...postingKeys.all, 'feed', params] as const,
  detail: (id: string) => [...postingKeys.all, 'detail', id] as const,
};

export function useMyPostings() {
  return useQuery({
    queryKey: postingKeys.mine(),
    queryFn: async (): Promise<Posting[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<Posting[]>>('/postings/mine');
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function usePostingsFeed(params: ListPostingsParams, enabled = true) {
  return useQuery({
    queryKey: postingKeys.feed(params),
    queryFn: async (): Promise<ListPostingsResult> => {
      try {
        const { data } = await apiClient.get<ListPostingsResult>('/postings', { params });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled,
  });
}

export function usePosting(id: string | undefined) {
  return useQuery({
    queryKey: postingKeys.detail(id ?? ''),
    queryFn: async (): Promise<Posting> => {
      try {
        const { data } = await apiClient.get<ApiResponse<Posting>>(`/postings/${id}`);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) {
          throw new PostingNotFoundError();
        }
        throw toApiError(error);
      }
    },
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreatePosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostingWriteInput): Promise<Posting> => {
      try {
        const { data } = await apiClient.post<ApiResponse<Posting>>('/postings', input);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError) throw error;
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: postingKeys.all });
    },
  });
}

export function useUpdatePosting(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostingPatchInput): Promise<Posting> => {
      try {
        const { data } = await apiClient.patch<ApiResponse<Posting>>(`/postings/${id}`, input);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError) throw error;
        throw toApiError(error);
      }
    },
    onSuccess: async (posting) => {
      queryClient.setQueryData(postingKeys.detail(id), posting);
      await queryClient.invalidateQueries({ queryKey: postingKeys.all });
    },
  });
}

export function useClosePosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<Posting> => {
      try {
        const { data } = await apiClient.post<ApiResponse<Posting>>(`/postings/${id}/close`);
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: postingKeys.all });
    },
  });
}

export function useDeletePosting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      try {
        await apiClient.delete(`/postings/${id}`);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: postingKeys.all });
    },
  });
}
