import type { KindLimitView, MediaKind } from '@contracts/media';
import type { VideoCodec } from './probe';

/**
 * What the browser can say about a file before a byte is sent. The server
 * checks size and type again; duration and codec are checked only here.
 */

const ALIASES: Readonly<Record<string, string>> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
};

/** Lower-cased, parameters dropped, and the browser aliases mapped to one name. Matches the API's. */
export function normaliseMimeType(type: string): string {
  const base = (type.split(';')[0] ?? '').trim().toLowerCase();
  return ALIASES[base] ?? base;
}

/** Some browsers leave `file.type` empty; the extension stands in for it. */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Pictures the browser resizes into WebP or JPEG. SVG is not among them. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** The file picker's pictures. HEIC is named by extension too: some browsers report no type for it. */
export const IMAGE_ACCEPT: readonly string[] = [...IMAGE_TYPES, '.heic', '.heif'];

/** Extensions beside each type, for phones that report a file's type wrongly or not at all. */
const EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'audio/mpeg': ['.mp3'],
  'audio/mp4': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg', '.opus'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'application/pdf': ['.pdf'],
};

const OTHER_KINDS = ['audio', 'video', 'document'] as const;

/** A file input's `accept` for one destination's limits: each enabled kind's types and extensions. */
export function acceptFor(limits: Readonly<Record<MediaKind, KindLimitView>>): string {
  const accepted = limits.image.enabled ? [...IMAGE_ACCEPT] : [];
  for (const kind of OTHER_KINDS) {
    const limit = limits[kind];
    if (!limit.enabled) continue;
    for (const type of limit.mimeTypes) accepted.push(type, ...(EXTENSIONS[type] ?? []));
  }
  return accepted.join(',');
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The file's normalised type, from `file.type` or, when that is empty, its extension. */
export function mimeTypeOf(file: Pick<File, 'name' | 'type'>): string {
  if (file.type) return normaliseMimeType(file.type);
  return BY_EXTENSION[extensionOf(file.name)] ?? '';
}

/** Which kind a picked file is, or null for a kind no offer can hold. */
export function classifyFile(file: Pick<File, 'name' | 'type'>): MediaKind | null {
  const type = mimeTypeOf(file);
  if (IMAGE_TYPES.has(type)) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  if (type === 'application/pdf') return 'document';
  return null;
}

export interface FileProbe {
  /** Seconds, as the browser read them; null when it could not. Audio and video only. */
  durationSeconds: number | null;
  /** Video only. */
  codec: VideoCodec | null;
}

export type RefusalReason = 'type' | 'size' | 'duration' | 'codec' | 'unreadable';

export type CheckResult = { ok: true } | { ok: false; reason: RefusalReason; limit: number | null };

/** Codecs many phones cannot play. */
const UNPLAYABLE_CODECS: ReadonlySet<VideoCodec> = new Set(['hvc1', 'hev1']);

/**
 * Whether the file may be uploaded as `kind`. Returns a reason, never a
 * sentence: the UI turns the reason into catalogue copy. `limit` is the number
 * the refusal broke (bytes or seconds), when there is one.
 */
export function checkBeforeUpload(
  file: Pick<File, 'name' | 'type' | 'size'>,
  kind: MediaKind,
  limit: KindLimitView,
  probe: FileProbe,
): CheckResult {
  if (!limit.enabled) return { ok: false, reason: 'type', limit: null };

  // An image is resized and re-encoded before upload, so its picked type and size are not what is stored.
  if (kind === 'image') {
    const maxPicked = limit.maxPickedBytes ?? limit.maxBytes;
    if (file.size > maxPicked) return { ok: false, reason: 'size', limit: maxPicked };
    return { ok: true };
  }

  if (!limit.mimeTypes.includes(mimeTypeOf(file))) return { ok: false, reason: 'type', limit: null };
  if (file.size > limit.maxBytes) return { ok: false, reason: 'size', limit: limit.maxBytes };

  if (kind === 'audio' || kind === 'video') {
    const seconds = probe.durationSeconds;
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
      return { ok: false, reason: 'unreadable', limit: null };
    }
    if (limit.maxDurationSeconds !== null && Math.ceil(seconds) > limit.maxDurationSeconds) {
      return { ok: false, reason: 'duration', limit: limit.maxDurationSeconds };
    }
  }

  if (kind === 'video' && probe.codec !== null && UNPLAYABLE_CODECS.has(probe.codec)) {
    return { ok: false, reason: 'codec', limit: null };
  }

  return { ok: true };
}

const KB = 1_000;
const MB = 1_000_000;
const GB = 1_000_000_000;

function scaled(bytes: number, unit: number, label: string): string {
  const value = bytes / unit;
  const text = value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value));
  return `${text} ${label}`;
}

/** "312 MB", "1.2 MB", "850 KB". 1 MB is 1,000,000 bytes, as the limits count it. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return scaled(bytes, GB, 'GB');
  if (bytes >= MB) return scaled(bytes, MB, 'MB');
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${Math.max(0, Math.round(bytes))} B`;
}

/** "4:05", or "1:02:03" for an hour or more. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
  return `${minutes}:${rest}`;
}
