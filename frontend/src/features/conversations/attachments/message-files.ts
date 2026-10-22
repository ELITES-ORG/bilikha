import type { ConversationAttachment } from '@contracts/conversations';
import type { KindLimitView, MediaKind } from '@contracts/media';
import { acceptFor, formatBytes, formatDuration, type RefusalReason } from '@/features/media/checks';
import type { MediaLimitsState } from '@/features/media/limits-api';
import type { MessageKey } from '@/i18n/catalogs/en';
import { fill } from '@/i18n/fill';
import { ApiError } from '@/lib/api-client';

/**
 * Files in a conversation without React (ADR 0060): whether the composer can
 * attach at all, what it tells people before they pick, the sentence for a
 * refused file, and what a file in the thread says about itself.
 */

type Translate = (key: MessageKey) => string;

/** "100 MB" with a no-break space, so a figure never splits across two lines. */
const keep = (figure: string) => figure.replace(/ /g, '\u00a0');

export interface MessageFileLimits {
  kinds: Readonly<Record<MediaKind, KindLimitView>>;
  filesPerMessage: number;
  accept: string;
}

/**
 * The message limits, or null while they load, when they cannot be read, and
 * when `MESSAGE_ATTACHMENTS` is off: then there is no attach button at all.
 */
export function messageFileLimits(state: MediaLimitsState): MessageFileLimits | null {
  if (!state.available) return null;
  const kinds = state.limits.destinations.message;
  if (!kinds || !Object.values(kinds).some((limit) => limit.enabled)) return null;
  return { kinds, filesPerMessage: state.limits.filesPerMessage, accept: acceptFor(kinds) };
}

/** "Up to 5 files a message · Photos up to 20 MB · …", from the limits the API serves. */
export function limitsSentence({ kinds, filesPerMessage }: MessageFileLimits, t: Translate): string {
  const seconds = (limit: KindLimitView) => formatDuration(limit.maxDurationSeconds ?? 0);
  const bytes = (value: number) => keep(formatBytes(value));
  return fill(t('messages.files.limits'), {
    count: String(filesPerMessage),
    image: bytes(kinds.image.maxPickedBytes ?? kinds.image.maxBytes),
    audioSize: bytes(kinds.audio.maxBytes),
    audioLength: seconds(kinds.audio),
    videoSize: bytes(kinds.video.maxBytes),
    videoLength: seconds(kinds.video),
    pdf: bytes(kinds.document.maxBytes),
  });
}

/** A refusal before upload, or a message already holding as many files as it may. */
export type MessageRefusal = RefusalReason | 'full';

export interface RefusalContext {
  sizeBytes?: number;
  durationSeconds?: number | null;
  /** The limit broken: bytes, seconds, or files a message. */
  limit?: number | null;
}

const REFUSAL_KEYS: Readonly<Record<MessageRefusal, MessageKey>> = {
  type: 'messages.files.refused.type',
  size: 'messages.files.refused.size',
  duration: 'messages.files.refused.duration',
  codec: 'messages.files.refused.codec',
  unreadable: 'messages.files.refused.unreadable',
  full: 'messages.files.refused.full',
};

export function refusalSentence(reason: MessageRefusal, context: RefusalContext, t: Translate): string {
  const text = t(REFUSAL_KEYS[reason]);
  if (reason === 'size') {
    return fill(text, { size: formatBytes(context.sizeBytes ?? 0), limit: formatBytes(context.limit ?? 0) });
  }
  if (reason === 'duration') {
    return fill(text, {
      length: formatDuration(context.durationSeconds ?? 0),
      limit: formatDuration(context.limit ?? 0),
    });
  }
  if (reason === 'full') return fill(text, { count: String(context.limit ?? 0) });
  return text;
}

/**
 * The sentence for an upload that failed after its checks passed: a full
 * message reads as that, any other API refusal as the API's own words, and a
 * transfer that broke off as "The upload stopped".
 */
export function uploadFailureSentence(error: unknown, filesPerMessage: number, t: Translate): string {
  if (error instanceof ApiError) {
    if (error.code === 'MEDIA_MESSAGE_FULL') return refusalSentence('full', { limit: filesPerMessage }, t);
    return error.message;
  }
  return t('messages.files.failed');
}

/**
 * Whether a send was refused because of its files: a ticket gone or expired,
 * a file that did not match its ticket, or one for another conversation. The
 * files are then dropped, and the person adds them again.
 */
export function isFileSendError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.code === 'MEDIA_UPLOAD_EXPIRED' ||
    error.code === 'MEDIA_VERIFICATION_FAILED' ||
    // Sending answers 409 only for a ticket from another conversation.
    error.status === 409
  );
}

export const KIND_LABELS: Readonly<Record<MediaKind, MessageKey>> = {
  image: 'messages.files.kind.image',
  audio: 'messages.files.kind.audio',
  video: 'messages.files.kind.video',
  document: 'messages.files.kind.document',
};

const EXPIRED_KEYS: Readonly<Record<MediaKind, MessageKey>> = {
  image: 'messages.files.expired.image',
  audio: 'messages.files.expired.audio',
  video: 'messages.files.expired.video',
  document: 'messages.files.expired.document',
};

/** "12 Nov 2026", in the reader's own date order. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Video · 42 MB · 2:10": what opening it costs, before it is opened. */
export function fileFacts(file: Pick<ConversationAttachment, 'kind' | 'sizeBytes' | 'durationSeconds'>, t: Translate) {
  return [
    t(KIND_LABELS[file.kind]),
    keep(formatBytes(file.sizeBytes)),
    ...(file.durationSeconds !== null ? [formatDuration(file.durationSeconds)] : []),
  ].join(' · ');
}

/** "Available until 12 Nov 2026", or null for a PDF, which is kept. */
export function untilSentence(file: Pick<ConversationAttachment, 'expiresAt'>, t: Translate): string | null {
  return file.expiresAt ? fill(t('messages.files.until'), { date: formatDay(file.expiresAt) }) : null;
}

/** The placeholder that takes an expired file's place: "This video expired on 12 Nov 2026." */
export function expiredSentence(file: Pick<ConversationAttachment, 'kind' | 'expiresAt'>, t: Translate): string {
  return fill(t(EXPIRED_KEYS[file.kind]), { date: file.expiresAt ? formatDay(file.expiresAt) : '' });
}
