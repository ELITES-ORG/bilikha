import { apiClient, toApiError } from '@/lib/api-client';

interface ApiResponse<T> {
  data: T;
}

export type AvatarUploadTicket = {
  kind: 'avatar';
  uploadUrl: string;
  objectKey: string;
};

export type OfferUploadTicket = {
  kind: 'offer';
  full: { uploadUrl: string; objectKey: string };
  thumb: { uploadUrl: string; objectKey: string };
};

/** A cover's two widths (ADR 0061): 1920px for `full`, 768px for `small`. */
export type CoverUploadTicket = {
  kind: 'cover';
  full: { uploadUrl: string; objectKey: string };
  small: { uploadUrl: string; objectKey: string };
};

export type UploadTicket = AvatarUploadTicket | OfferUploadTicket | CoverUploadTicket;

/** Ask the API for a signed upload URL. Image bytes never go through our server. */
export async function requestUploadUrl(kind: 'avatar' | 'offer' | 'cover'): Promise<UploadTicket> {
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

/** The cover's pair waits for review (ADR 0058); the approved cover stays public meanwhile. */
export async function confirmCover(objectKey: string, smallKey: string): Promise<void> {
  try {
    await apiClient.put('/media/cover', { objectKey, smallKey });
  } catch (error) {
    throw toApiError(error);
  }
}

/** Withdraws a cover waiting for review, or removes the approved one. */
export async function removeCover(): Promise<void> {
  try {
    await apiClient.delete('/media/cover');
  } catch (error) {
    throw toApiError(error);
  }
}

export async function abandonUpload(objectKey: string): Promise<void> {
  try {
    await apiClient.post('/media/abandon', { objectKey });
  } catch (error) {
    throw toApiError(error);
  }
}
