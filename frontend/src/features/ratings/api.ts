import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import type {
  AgreementRating,
  ProfileRating,
  RatingPayload,
  RatingReport,
  RatingSummary,
} from './types';
import type { Paginated } from '@contracts/pagination';

interface ApiResponse<T> {
  data: T;
}

type ListResponse<T> = Paginated<T>;

export const ratingKeys = {
  all: ['ratings'] as const,
  summary: (slug: string) => ['ratings', 'summary', slug] as const,
  list: (slug: string, page: number) => ['ratings', 'list', slug, page] as const,
  forAgreement: (agreementId: string) => ['ratings', 'agreement', agreementId] as const,
  reports: () => ['admin', 'ratings'] as const,
};

/**
 * Public, like the profile it belongs to. Fetched separately from the profile
 * so the directory and the offer index can never pick up a rating join by
 * accident (plan 0021 rule 5).
 */
export function useRatingSummary(slug: string | undefined) {
  return useQuery({
    queryKey: ratingKeys.summary(slug ?? ''),
    enabled: Boolean(slug),
    queryFn: async (): Promise<RatingSummary> => {
      try {
        const { data } = await apiClient.get<ApiResponse<RatingSummary>>(
          `/creatives/${slug}/ratings/summary`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useProfileRatings(slug: string | undefined, page = 1) {
  return useQuery({
    queryKey: ratingKeys.list(slug ?? '', page),
    enabled: Boolean(slug),
    queryFn: async (): Promise<ListResponse<ProfileRating>> => {
      try {
        const { data } = await apiClient.get<ListResponse<ProfileRating>>(
          `/creatives/${slug}/ratings`,
          { params: { page, limit: 20 } },
        );
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/** Null when the agreement has not been rated. */
export function useAgreementRating(agreementId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ratingKeys.forAgreement(agreementId ?? ''),
    enabled: Boolean(agreementId) && enabled,
    queryFn: async (): Promise<AgreementRating | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AgreementRating | null>>(
          `/agreements/${agreementId}/rating`,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * Every write invalidates the whole ratings namespace: leaving one changes the
 * agreement record, the profile's list and its count, and the count has to
 * agree with the list it is printed beside.
 */
function useRatingWrite<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ratingKeys.all }),
  });
}

export function useRateAgreement(agreementId: string) {
  return useRatingWrite(async (payload: RatingPayload): Promise<AgreementRating> => {
    try {
      const { data } = await apiClient.post<ApiResponse<AgreementRating>>(
        `/agreements/${agreementId}/rating`,
        payload,
      );
      return data.data;
    } catch (error) {
      throw toApiError(error);
    }
  });
}

/** Author only, and refused by the server once the window has closed. */
export function useUpdateRating(ratingId: string) {
  return useRatingWrite(async (payload: RatingPayload): Promise<AgreementRating> => {
    try {
      const { data } = await apiClient.patch<ApiResponse<AgreementRating>>(
        `/ratings/${ratingId}`,
        payload,
      );
      return data.data;
    } catch (error) {
      throw toApiError(error);
    }
  });
}

/**
 * Also author only and also inside the window: taking a rating back is the
 * other half of changing your mind, and the profile's count has to follow it
 * down, which the shared invalidation above does.
 */
export function useDeleteRating(ratingId: string) {
  return useRatingWrite<void, void>(async () => {
    try {
      await apiClient.delete(`/ratings/${ratingId}`);
    } catch (error) {
      throw toApiError(error);
    }
  });
}

/** The creative's appeal. Their only recourse — ADR 0033. */
export function useReportRating(ratingId: string) {
  return useMutation({
    mutationFn: async (reason: string): Promise<{ id: string; status: string }> => {
      try {
        const { data } = await apiClient.post<ApiResponse<{ id: string; status: string }>>(
          `/ratings/${ratingId}/report`,
          { reason },
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useRatingReports() {
  return useQuery({
    queryKey: ratingKeys.reports(),
    queryFn: async (): Promise<ListResponse<RatingReport>> => {
      try {
        const { data } = await apiClient.get<ListResponse<RatingReport>>('/admin/ratings', {
          params: { page: 1, limit: 50 },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/**
 * The two answers an administrator has. Dismissing leaves the rating standing;
 * removing deletes it and writes `rating_removed` with the reason. Nothing
 * here edits somebody else's words.
 */
export function useAnswerRatingReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input:
        | { action: 'dismiss'; reportId: string }
        | { action: 'remove'; ratingId: string; reason: string },
    ): Promise<void> => {
      try {
        if (input.action === 'dismiss') {
          await apiClient.post(`/admin/ratings/reports/${input.reportId}/dismiss`);
        } else {
          await apiClient.post(`/admin/ratings/${input.ratingId}/remove`, {
            reason: input.reason,
          });
        }
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ratingKeys.reports() }),
        queryClient.invalidateQueries({ queryKey: ratingKeys.all }),
      ]);
    },
  });
}
