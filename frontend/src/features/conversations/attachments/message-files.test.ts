import { describe, expect, it } from 'vitest';
import type { ConversationAttachment } from '@contracts/conversations';
import type { KindLimitView, MediaKind, MediaLimits } from '@contracts/media';
import type { MediaLimitsState } from '@/features/media/limits-api';
import type { MessageKey } from '@/i18n/catalogs/en';
import { enMessages } from '@/i18n/catalogs/messages/en';
import { ApiError } from '@/lib/api-client';
import {
  expiredSentence,
  fileFacts,
  isFileSendError,
  limitsSentence,
  messageFileLimits,
  refusalSentence,
  untilSentence,
  uploadFailureSentence,
} from './message-files';

const MB = 1_000_000;
const t = (key: MessageKey) => (enMessages as Readonly<Record<string, string>>)[key] ?? key;

const kind = (overrides: Partial<KindLimitView>): KindLimitView => ({
  enabled: true,
  maxBytes: 10 * MB,
  maxPickedBytes: null,
  maxDurationSeconds: null,
  mimeTypes: [],
  perTarget: 5,
  transport: 'tus',
  ...overrides,
});

/** The limits #66 sets for messages, every kind on or off together. */
function state(enabled: boolean): MediaLimitsState {
  const message: Record<MediaKind, KindLimitView> = {
    image: kind({ enabled, maxBytes: 2 * MB, maxPickedBytes: 20 * MB, mimeTypes: ['image/webp', 'image/jpeg'], transport: 'put' }),
    audio: kind({ enabled, maxBytes: 15 * MB, maxDurationSeconds: 600, mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'] }),
    video: kind({ enabled, maxBytes: 100 * MB, maxDurationSeconds: 180, mimeTypes: ['video/mp4', 'video/webm'] }),
    document: kind({ enabled, mimeTypes: ['application/pdf'] }),
  };
  const limits: MediaLimits = {
    quotaBytes: 1_000 * MB,
    filesPerMessage: 5,
    destinations: { offer: message, message },
  };
  return { available: true, limits };
}

const file = (overrides: Partial<ConversationAttachment>): ConversationAttachment => ({
  id: 'a1',
  kind: 'video',
  mimeType: 'video/mp4',
  sizeBytes: 42 * MB,
  durationSeconds: 130,
  hasThumb: true,
  expiresAt: '2026-11-12T08:00:00.000Z',
  expired: false,
  ...overrides,
});

describe('messageFileLimits', () => {
  it('offers no attach button while the limits load, cannot be read, or the switch is off', () => {
    expect(messageFileLimits({ available: false, loading: true })).toBeNull();
    expect(messageFileLimits({ available: false, loading: false })).toBeNull();
    expect(messageFileLimits(state(false))).toBeNull();
  });

  it('accepts every kind, by type and extension, when the switch is on', () => {
    const limits = messageFileLimits(state(true))!;
    expect(limits.filesPerMessage).toBe(5);
    expect(limits.accept.split(',')).toEqual(expect.arrayContaining(['image/jpeg', '.heic', 'audio/mpeg', '.m4a', 'video/mp4', 'application/pdf', '.pdf']));
  });

  it('says what can be sent before anything is picked, from the limits the API serves', () => {
    expect(limitsSentence(messageFileLimits(state(true))!, t).replace(/\u00a0/g, ' ')).toBe(
      'Up to 5 files a message · Photos up to 20 MB · Audio up to 15 MB and 10:00 · Video up to 100 MB and 3:00 · PDF up to 10 MB',
    );
    // A figure never splits across two lines.
    expect(limitsSentence(messageFileLimits(state(true))!, t)).toContain('100\u00a0MB');
  });
});

describe('refusals', () => {
  it('names the size and the limit, the length and the limit, and the count', () => {
    expect(refusalSentence('size', { sizeBytes: 120 * MB, limit: 100 * MB }, t)).toBe(
      'This file is 120 MB. This kind can be up to 100 MB.',
    );
    expect(refusalSentence('duration', { durationSeconds: 200, limit: 180 }, t)).toBe(
      'This recording is 3:20 long. This kind can be up to 3:00.',
    );
    expect(refusalSentence('full', { limit: 5 }, t)).toBe('A message can carry at most 5 files.');
  });

  it("reads a full message as that, another API refusal in the API's words, and a broken transfer as stopped", () => {
    expect(uploadFailureSentence(new ApiError('Full.', 409, 'MEDIA_MESSAGE_FULL'), 5, t)).toBe(
      'A message can carry at most 5 files.',
    );
    expect(uploadFailureSentence(new ApiError('This message cannot be delivered.', 403, 'FORBIDDEN'), 5, t)).toBe(
      'This message cannot be delivered.',
    );
    expect(uploadFailureSentence(new Error('network'), 5, t)).toBe('The upload stopped. Try again.');
  });

  it("knows a send refused for its files from one refused for anything else", () => {
    expect(isFileSendError(new ApiError('Gone', 410, 'MEDIA_UPLOAD_EXPIRED'))).toBe(true);
    expect(isFileSendError(new ApiError('Bad', 422, 'MEDIA_VERIFICATION_FAILED'))).toBe(true);
    expect(isFileSendError(new ApiError('Elsewhere', 409, 'CONFLICT'))).toBe(true);
    expect(isFileSendError(new ApiError('This message cannot be delivered.', 403, 'FORBIDDEN'))).toBe(false);
    expect(isFileSendError(new Error('network'))).toBe(false);
  });
});

describe('a file in the thread', () => {
  it('says what opening it costs before it is opened', () => {
    expect(fileFacts(file({}), t)).toBe('Video · 42\u00a0MB · 2:10');
    expect(fileFacts(file({ kind: 'document', sizeBytes: 2_400_000, durationSeconds: null }), t)).toBe('PDF · 2.4\u00a0MB');
  });

  it('says until when a photo, audio or video is kept, and nothing for a PDF', () => {
    expect(untilSentence(file({}), t)).toMatch(/^Available until .*2026/);
    expect(untilSentence(file({ kind: 'document', expiresAt: null }), t)).toBeNull();
  });

  it('leaves a placeholder naming what was there and when it went', () => {
    expect(expiredSentence(file({ expired: true }), t)).toMatch(/^This video expired on .*2026\.$/);
    expect(expiredSentence(file({ kind: 'image', expired: true }), t)).toMatch(/^This photo expired on /);
  });
});
