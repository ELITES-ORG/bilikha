import { env } from '../../config/env.js';
import type { KindLimitView, MediaKind, MediaLimits, UploadDestination } from '../../contracts/media.js';

/**
 * Every upload limit, in one place (ADR 0046). The browser reads them from
 * `GET /api/v1/media/limits` and never keeps its own copy. MB is 1,000,000
 * bytes, as Supabase counts it.
 */
export const MB = 1_000_000;

export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'document'];

export interface KindLimit {
  /** Largest stored file. For an image, each of the display image and its thumbnail. */
  maxBytes: number;
  /** Largest file the browser may pick before resizing. Images only. */
  maxPickedBytes: number | null;
  maxDurationSeconds: number | null;
  /** Normalised types storage holds for this kind. */
  mimeTypes: readonly string[];
  /** How many of this kind one target (an offer, or a message) may hold. */
  perTarget: number;
  /** Counted against the quota while the upload is pending. */
  reservedBytes: number;
  transport: 'put' | 'tus';
  /** Appended to SUPABASE_STORAGE_BUCKET to name the kind's bucket. */
  bucketSuffix:
    | ''
    | '-audio'
    | '-video'
    | '-documents'
    | '-messages'
    | '-messages-audio'
    | '-messages-video'
    | '-messages-documents';
  /** The extension a stored type's key ends in. Images keep `.webp` keys (ADR 0021). */
  extensions: Readonly<Record<string, string>>;
}

export const UPLOAD_LIMITS: Readonly<Record<UploadDestination, Readonly<Record<MediaKind, KindLimit>>>> = {
  offer: {
    image: {
      maxBytes: 2 * MB,
      maxPickedBytes: 20 * MB,
      maxDurationSeconds: null,
      mimeTypes: ['image/webp', 'image/jpeg'],
      perTarget: 10,
      reservedBytes: 4 * MB,
      transport: 'put',
      bucketSuffix: '',
      extensions: { 'image/webp': 'webp', 'image/jpeg': 'webp' },
    },
    audio: {
      maxBytes: 15 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 600,
      mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'],
      perTarget: 5,
      reservedBytes: 15 * MB,
      transport: 'tus',
      bucketSuffix: '-audio',
      extensions: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg' },
    },
    video: {
      maxBytes: 300 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 300,
      mimeTypes: ['video/mp4', 'video/webm'],
      perTarget: 2,
      reservedBytes: 302 * MB,
      transport: 'tus',
      bucketSuffix: '-video',
      extensions: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
    },
    document: {
      maxBytes: 10 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: null,
      mimeTypes: ['application/pdf'],
      perTarget: 3,
      reservedBytes: 10 * MB,
      transport: 'tus',
      bucketSuffix: '-documents',
      extensions: { 'application/pdf': 'pdf' },
    },
  },
  // Messages (ADR 0060, #66): an offer's caps, but a shorter chat video, and
  // private buckets. `perTarget` is per message; `FILES_PER_MESSAGE` caps the
  // mix. Reservations are not counted against any quota.
  message: {
    image: {
      maxBytes: 2 * MB,
      maxPickedBytes: 20 * MB,
      maxDurationSeconds: null,
      mimeTypes: ['image/webp', 'image/jpeg'],
      perTarget: 5,
      reservedBytes: 4 * MB,
      transport: 'put',
      bucketSuffix: '-messages',
      extensions: { 'image/webp': 'webp', 'image/jpeg': 'webp' },
    },
    audio: {
      maxBytes: 15 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 600,
      mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'],
      perTarget: 5,
      reservedBytes: 15 * MB,
      transport: 'tus',
      bucketSuffix: '-messages-audio',
      extensions: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg' },
    },
    video: {
      maxBytes: 100 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: 180,
      mimeTypes: ['video/mp4', 'video/webm'],
      perTarget: 5,
      reservedBytes: 102 * MB,
      transport: 'tus',
      bucketSuffix: '-messages-video',
      extensions: { 'video/mp4': 'mp4', 'video/webm': 'webm' },
    },
    document: {
      maxBytes: 10 * MB,
      maxPickedBytes: null,
      maxDurationSeconds: null,
      mimeTypes: ['application/pdf'],
      perTarget: 5,
      reservedBytes: 10 * MB,
      transport: 'tus',
      bucketSuffix: '-messages-documents',
      extensions: { 'application/pdf': 'pdf' },
    },
  },
};

/** At most this many files in one message, of any kinds (#66). */
export const FILES_PER_MESSAGE = 5;

/** How long a photo, audio clip or video in a message stays readable (ADR 0060). */
export const MESSAGE_FILE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** When a message file stops opening: 30 days after it was sent, or never for a PDF. */
export function messageFileExpiry(kind: MediaKind, sentAt: Date): Date | null {
  return kind === 'document' ? null : new Date(sentAt.getTime() + MESSAGE_FILE_LIFETIME_MS);
}

/** Message files are private: read only through short signed URLs (ADR 0060). */
export function isPrivateDestination(destination: UploadDestination): boolean {
  return destination === 'message';
}

/** Per creative, across every offer (ADR 0046). */
export const QUOTA_BYTES = 1_000 * MB;

/** How long a ticket holds its reservation. */
export const RESERVATION_MS = 24 * 60 * 60 * 1000;

const ALIASES: Readonly<Record<string, string>> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
};

/** Lower-cased, parameters dropped, and the browser aliases mapped to one name. */
export function normaliseMimeType(type: string): string {
  const base = (type.split(';')[0] ?? '').trim().toLowerCase();
  return ALIASES[base] ?? base;
}

export function bucketFor(kind: MediaKind, destination: UploadDestination = 'offer'): string {
  return `${env.SUPABASE_STORAGE_BUCKET}${UPLOAD_LIMITS[destination][kind].bucketSuffix}`;
}

/**
 * For offers: images always, the rest as `MEDIA_UPLOAD_KINDS` says. For
 * messages: every kind, or none, as `MESSAGE_ATTACHMENTS` says.
 */
export function enabledKinds(destination: UploadDestination = 'offer'): MediaKind[] {
  if (destination === 'message') return env.MESSAGE_ATTACHMENTS ? [...MEDIA_KINDS] : [];
  return ['image', ...env.MEDIA_UPLOAD_KINDS];
}

export function isKindEnabled(kind: MediaKind, destination: UploadDestination = 'offer'): boolean {
  return enabledKinds(destination).includes(kind);
}

/** What `GET /media/limits` serves. */
export function mediaLimitsView(): MediaLimits {
  const view = (destination: UploadDestination) =>
    Object.fromEntries(
      MEDIA_KINDS.map((kind) => {
        const limit = UPLOAD_LIMITS[destination][kind];
        const item: KindLimitView = {
          enabled: isKindEnabled(kind, destination),
          maxBytes: limit.maxBytes,
          maxPickedBytes: limit.maxPickedBytes,
          maxDurationSeconds: limit.maxDurationSeconds,
          mimeTypes: [...limit.mimeTypes],
          perTarget: limit.perTarget,
          transport: limit.transport,
        };
        return [kind, item];
      }),
    ) as Record<MediaKind, KindLimitView>;
  return {
    quotaBytes: QUOTA_BYTES,
    filesPerMessage: FILES_PER_MESSAGE,
    destinations: { offer: view('offer'), message: view('message') },
  };
}
