import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IdType, IdUploadTicket, OwnIdVerification } from '@contracts/verification';
import { authKeys } from '@/features/auth/api';
import { writeLastSession } from '@/features/auth/session-cache';
import type { AuthUser } from '@/features/auth/types';
import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

/** A signed URL for one side of the ID, in the private ID bucket (ADR 0057). */
export async function requestIdUploadUrl(
  side: 'front' | 'back',
  contentType: 'image/webp' | 'image/jpeg',
): Promise<IdUploadTicket> {
  try {
    const { data } = await apiClient.post<ApiResponse<IdUploadTicket>>('/verification/upload-url', {
      side,
      contentType,
    });
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export interface IdSubmission {
  idType: IdType;
  frontKey: string;
  backKey?: string;
  idConsent: true;
}

/**
 * Sends the uploaded photos for review. The answer is the account's new
 * verification status, written straight into the session so the banner and
 * the gate change without another round trip.
 */
export function useSubmitId() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submission: IdSubmission): Promise<OwnIdVerification> => {
      try {
        const { data } = await apiClient.post<ApiResponse<OwnIdVerification>>(
          '/verification/submission',
          submission,
        );
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (idVerification) => {
      const user = queryClient.getQueryData<AuthUser | null>(authKeys.me);
      if (user) {
        const next = { ...user, idVerification };
        queryClient.setQueryData(authKeys.me, next);
        writeLastSession(next);
      }
    },
  });
}
