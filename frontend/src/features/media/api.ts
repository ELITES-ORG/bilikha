import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

export type AvatarUploadTicket = {
  kind: 'avatar';
  uploadUrl: string;
  objectKey: string;
};

export type PortfolioUploadTicket = {
  kind: 'portfolio';
  full: { uploadUrl: string; objectKey: string };
  thumb: { uploadUrl: string; objectKey: string };
};

export type UploadTicket = AvatarUploadTicket | PortfolioUploadTicket;

/** Ask the API for a signed upload URL. Image bytes never go through our server. */
export async function requestUploadUrl(kind: 'avatar' | 'portfolio'): Promise<UploadTicket> {
  try {
    const { data } = await apiClient.post<ApiResponse<UploadTicket>>('/media/upload-url', { kind });
    return data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * PUT the resized blob straight to storage. Uses plain fetch — not the shared
 * axios client — because credentials and our API base URL must not be attached
 * to a third-party origin.
 */
export async function uploadImage(blob: Blob, uploadUrl: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.type || 'image/webp',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error('Upload failed. Check your connection and try again.');
  }
}

export async function confirmAvatar(objectKey: string): Promise<void> {
  try {
    await apiClient.put('/media/avatar', { objectKey });
  } catch (error) {
    throw toApiError(error);
  }
}

export async function removeAvatar(): Promise<void> {
  try {
    await apiClient.delete('/media/avatar');
  } catch (error) {
    throw toApiError(error);
  }
}
