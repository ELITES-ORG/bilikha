import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationAttachmentUrl } from '@contracts/conversations';
import { ApiError, apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

export type AttachmentVariant = 'file' | 'thumb';

/**
 * A signed URL lives five minutes at most, so it is reused for four and then
 * asked for again. Polling the thread never asks: only showing a thumbnail or
 * tapping a file does (ADR 0060).
 */
const FRESH_MS = 4 * 60_000;

export const attachmentKeys = {
  url: (conversationId: string, attachmentId: string, variant: AttachmentVariant) =>
    ['conversations', 'attachment', conversationId, attachmentId, variant] as const,
};

export async function fetchAttachmentUrl(
  conversationId: string,
  attachmentId: string,
  variant: AttachmentVariant,
): Promise<ConversationAttachmentUrl> {
  try {
    const { data } = await apiClient.get<ApiResponse<ConversationAttachmentUrl>>(
      `/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(attachmentId)}/url`,
      { params: { variant } },
    );
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** True for the API's answer to a file past its 30 days. */
export const isExpiredError = (error: unknown) => error instanceof ApiError && error.status === 410;

/** A thumbnail's URL, fetched as soon as it is shown. */
export function useAttachmentThumb(conversationId: string, attachmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: attachmentKeys.url(conversationId, attachmentId, 'thumb'),
    queryFn: () => fetchAttachmentUrl(conversationId, attachmentId, 'thumb'),
    enabled,
    staleTime: FRESH_MS,
    gcTime: FRESH_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** The file's own URL, asked for only when someone taps it. */
export function useFileUrl(conversationId: string) {
  const queryClient = useQueryClient();
  return (attachmentId: string) =>
    queryClient.fetchQuery({
      queryKey: attachmentKeys.url(conversationId, attachmentId, 'file'),
      queryFn: () => fetchAttachmentUrl(conversationId, attachmentId, 'file'),
      staleTime: FRESH_MS,
      gcTime: FRESH_MS,
      retry: false,
    });
}

/**
 * The same URL, asking storage to send it as a download. Supabase reads
 * `download` on a signed URL and answers with `Content-Disposition:
 * attachment`, which the browser saves instead of showing.
 */
export function asDownload(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=`;
}
