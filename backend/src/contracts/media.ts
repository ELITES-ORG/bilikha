/**
 * The upload pipeline's shapes (ADR 0046): the limits the browser reads before
 * a file is picked, the ticket that authorises one upload, and the media an
 * offer carries beside its images. Messages are a second destination
 * (ADR 0060).
 */

export type MediaKind = 'image' | 'audio' | 'video' | 'document';

/** Where an upload is going. */
export type UploadDestination = 'offer' | 'message';

export interface KindLimitView {
  enabled: boolean;
  maxBytes: number;
  maxPickedBytes: number | null;
  maxDurationSeconds: number | null;
  mimeTypes: string[];
  perTarget: number;
  transport: 'put' | 'tus';
}

/** `GET /media/limits`. MB is 1,000,000 bytes. */
export interface MediaLimits {
  /** Per creative, across their offers. Messages have no quota (ADR 0060). */
  quotaBytes: number;
  /** At most this many files in one message, of any kinds. */
  filesPerMessage: number;
  destinations: Record<UploadDestination, Record<MediaKind, KindLimitView>>;
}

/** `GET /media/usage`. */
export interface MediaUsage {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
}

interface UploadTicketFile {
  kind: MediaKind;
  mimeType: string;
  /** The main file; for an image, the display image. */
  sizeBytes: number;
  /** An image's thumbnail (required) or a video's poster (optional). */
  thumbSizeBytes?: number;
  /** Required for audio and video. */
  durationSeconds?: number;
}

/** `POST /media/uploads`: a file for an offer, or for a message not yet sent. */
export type UploadTicketBody =
  | (UploadTicketFile & { destination: 'offer'; offerId: string })
  | (UploadTicketFile & { destination: 'message'; conversationId: string });

export interface SignedPut {
  uploadUrl: string;
  objectKey: string;
}

export type UploadTicket =
  | {
      reservationId: string;
      expiresAt: string;
      kind: 'image';
      transport: 'put';
      file: SignedPut;
      thumb: SignedPut;
    }
  | {
      reservationId: string;
      expiresAt: string;
      kind: 'audio' | 'video' | 'document';
      transport: 'tus';
      tus: { endpoint: string; token: string; bucket: string; objectKey: string };
      /** A video's poster, only when its size was declared. */
      poster?: SignedPut;
    };

export interface OfferMediaItem {
  id: string;
  kind: 'audio' | 'video' | 'document';
  url: string;
  /** Video only. */
  posterUrl: string | null;
  title: string | null;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  sortOrder: number;
}

/** What an offer card says about the offer's media, without a player. */
export interface MediaBadge {
  kind: 'audio' | 'video' | 'document';
  count: number;
  durationSeconds: number | null;
}
