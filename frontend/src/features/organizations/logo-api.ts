import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadImage } from '@/features/media/api';
import { apiClient, toApiError } from '@/lib/api-client';
import { THUMB_EDGE, resizeImage } from '@/lib/image';
import { organizationKeys } from './api';

/**
 * Logo uploads, kept apart from `./api` because the directory imports that
 * module on every first visit and these pull in the image resizer. Only the
 * manage page, a lazy route, loads this one.
 */

interface ApiResponse<T> {
  data: T;
}

async function call<T>(method: 'post' | 'put' | 'delete', url: string, body?: object): Promise<T> {
  try {
    const { data } =
      method === 'delete'
        ? await apiClient.delete<ApiResponse<T>>(url)
        : await apiClient[method]<ApiResponse<T>>(url, body ?? {});
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * A new logo, the way a profile photo is set: resized on the device, uploaded
 * straight to storage with a signed URL, then attached. Not retried — a retry
 * would upload a second copy.
 */
export function useSetLogo(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (file: File) => {
      const blob = await resizeImage(file, THUMB_EDGE);
      const ticket = await call<{ uploadUrl: string; objectKey: string }>(
        'post',
        `/organizations/${slug}/logo/upload-url`,
      );
      await uploadImage(blob, ticket.uploadUrl);
      await call<{ objectKey: string }>('put', `/organizations/${slug}/logo`, {
        objectKey: ticket.objectKey,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
  });
}

export function useRemoveLogo(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ removed: boolean }>('delete', `/organizations/${slug}/logo`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
  });
}
