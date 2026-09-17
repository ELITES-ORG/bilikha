import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, toApiError } from '@/lib/api-client';
import type { ViewMode } from '@/features/auth/types';
import { conversationKeys } from '@/features/conversations/api';
import type {
  AcceptAgreementPayload,
  Agreement,
  AgreementListRow,
  IssueAgreementPayload,
  RecordEventPayload,
} from './types';

interface ApiResponse<T> {
  data: T;
}

/** A non-party gets the same 404 as a missing agreement, so the page shows 404. */
export class AgreementNotFoundError extends Error {
  constructor() {
    super('No such work agreement.');
    this.name = 'AgreementNotFoundError';
  }
}

export const agreementKeys = {
  all: ['agreements'] as const,
  detail: (id: string) => ['agreements', 'detail', id] as const,
  list: (mode: ViewMode) => ['agreements', 'list', mode] as const,
};

function rethrowForForms(error: unknown): never {
  if (error instanceof AxiosError) throw error;
  throw toApiError(error);
}

export function useAgreement(id: string | undefined) {
  return useQuery({
    queryKey: agreementKeys.detail(id ?? ''),
    queryFn: async (): Promise<Agreement> => {
      try {
        const { data } = await apiClient.get<ApiResponse<Agreement>>(`/agreements/${id}`);
        return data.data;
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 404) {
          throw new AgreementNotFoundError();
        }
        throw toApiError(error);
      }
    },
    enabled: Boolean(id),
    retry: false,
  });
}

/** Mirrored by mode: creative lists what it issued, hiring what it received. */
export function useAgreements(mode: ViewMode, enabled = true) {
  return useQuery({
    queryKey: agreementKeys.list(mode),
    queryFn: async (): Promise<AgreementListRow[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<AgreementListRow[]>>('/agreements', {
          params: { mode },
        });
        return data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    enabled,
  });
}

/**
 * Every write posts a message into the thread, so each one invalidates the
 * conversation keys as well as the agreement's own.
 */
function useAgreementWrite<TInput, TResult>(
  request: (input: TInput) => Promise<TResult>,
  agreementId?: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      if (agreementId) {
        void queryClient.invalidateQueries({ queryKey: agreementKeys.detail(agreementId) });
      }
      void queryClient.invalidateQueries({ queryKey: agreementKeys.all });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
    onError: () => {
      // Most refusals mean the document moved on under the viewer — it was
      // superseded, accepted, or already past this transition. Refetch so the
      // screen stops offering what the server just declined.
      if (agreementId) {
        void queryClient.invalidateQueries({ queryKey: agreementKeys.detail(agreementId) });
      }
    },
  });
}

export interface IssuedAgreement {
  id: string;
  version: number;
  conversationId: string;
  packageTitle: string;
  status: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  totalCentavos: number;
  contentHash: string;
  messageId: string;
}

export function useIssueAgreement(conversationId: string) {
  return useAgreementWrite(async (payload: IssueAgreementPayload): Promise<IssuedAgreement> => {
    try {
      const { data } = await apiClient.post<ApiResponse<IssuedAgreement>>(
        `/conversations/${conversationId}/agreements`,
        payload,
      );
      return data.data;
    } catch (error) {
      rethrowForForms(error);
    }
  });
}

export function useRequestRevision(agreementId: string) {
  return useAgreementWrite(async (note: string) => {
    try {
      const { data } = await apiClient.post<
        ApiResponse<{ id: string; revisionRequestedAt: string }>
      >(`/agreements/${agreementId}/revision`, { note });
      return data.data;
    } catch (error) {
      rethrowForForms(error);
    }
  }, agreementId);
}

export function useAcceptAgreement(agreementId: string) {
  return useAgreementWrite(async (payload: AcceptAgreementPayload) => {
    try {
      const { data } = await apiClient.post<
        ApiResponse<{ id: string; status: string; acceptedAt: string; fingerprint: string }>
      >(`/agreements/${agreementId}/accept`, payload);
      return data.data;
    } catch (error) {
      rethrowForForms(error);
    }
  }, agreementId);
}

export function useRecordAgreementEvent(agreementId: string) {
  return useAgreementWrite(async (payload: RecordEventPayload) => {
    try {
      const { data } = await apiClient.post<
        ApiResponse<{ id: string; type: string; state: string; at: string }>
      >(`/agreements/${agreementId}/events`, payload);
      return data.data;
    } catch (error) {
      rethrowForForms(error);
    }
  }, agreementId);
}
