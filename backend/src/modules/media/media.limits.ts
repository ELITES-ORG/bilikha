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
  /** How many of this kind one target (an offer) may hold. */
  perTarget: number;
  /** Counted against the quota while the upload is pending. */
  reservedBytes: number;
  transport: 'put' | 'tus';
  /** Appended to SUPABASE_STORAGE_BUCKET to name the kind's bucket. */
  bucketSuffix: '' | '-audio' | '-video' | '-documents';
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
};

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

/** Images always; the rest as `MEDIA_UPLOAD_KINDS` says. */
export function enabledKinds(): MediaKind[] {
  return ['image', ...env.MEDIA_UPLOAD_KINDS];
}

export function isKindEnabled(kind: MediaKind): boolean {
  return enabledKinds().includes(kind);
}

/** What `GET /media/limits` serves. */
export function mediaLimitsView(): MediaLimits {
  const view = (destination: UploadDestination) =>
    Object.fromEntries(
      MEDIA_KINDS.map((kind) => {
        const limit = UPLOAD_LIMITS[destination][kind];
        const item: KindLimitView = {
          enabled: isKindEnabled(kind),
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
  return { quotaBytes: QUOTA_BYTES, destinations: { offer: view('offer') } };
}
