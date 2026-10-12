import { describe, expect, it } from 'vitest';
import type { KindLimitView } from '@contracts/media';
import { checkBeforeUpload, classifyFile, formatBytes, formatDuration, mimeTypeOf, normaliseMimeType } from './checks';

const MB = 1_000_000;

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

const limit = (overrides: Partial<KindLimitView> = {}): KindLimitView => ({
  enabled: true,
  maxBytes: 15 * MB,
  maxPickedBytes: null,
  maxDurationSeconds: 600,
  mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'],
  perTarget: 5,
  transport: 'tus',
  ...overrides,
});

const video = limit({
  maxBytes: 300 * MB,
  maxDurationSeconds: 300,
  mimeTypes: ['video/mp4', 'video/webm'],
  perTarget: 2,
});

const image = limit({
  maxBytes: 2 * MB,
  maxPickedBytes: 20 * MB,
  maxDurationSeconds: null,
  mimeTypes: ['image/webp', 'image/jpeg'],
  transport: 'put',
});

const pdf = limit({ maxBytes: 10 * MB, maxDurationSeconds: null, mimeTypes: ['application/pdf'], perTarget: 3 });

const heard = (durationSeconds: number | null) => ({ durationSeconds, codec: null });

describe('normaliseMimeType', () => {
  it('maps the browser aliases to one name, as the API does', () => {
    expect(normaliseMimeType('audio/x-m4a')).toBe('audio/mp4');
    expect(normaliseMimeType('audio/mp3')).toBe('audio/mpeg');
    expect(normaliseMimeType('audio/opus')).toBe('audio/ogg');
    expect(normaliseMimeType('audio/x-aac')).toBe('audio/aac');
  });

  it('lower-cases and drops parameters', () => {
    expect(normaliseMimeType('Audio/MPEG; codecs=x')).toBe('audio/mpeg');
  });
});

describe('classifyFile', () => {
  it('classifies by type', () => {
    expect(classifyFile(file('a.bin', 'audio/x-m4a'))).toBe('audio');
    expect(classifyFile(file('a.bin', 'video/webm'))).toBe('video');
    expect(classifyFile(file('a.bin', 'application/pdf'))).toBe('document');
    expect(classifyFile(file('a.bin', 'image/png'))).toBe('image');
  });

  it('falls back to the extension when the type is empty', () => {
    expect(classifyFile(file('song.MP3', ''))).toBe('audio');
    expect(classifyFile(file('voice.opus', ''))).toBe('audio');
    expect(classifyFile(file('clip.mp4', ''))).toBe('video');
    expect(classifyFile(file('cv.pdf', ''))).toBe('document');
    expect(classifyFile(file('photo.heic', ''))).toBe('image');
    expect(mimeTypeOf(file('voice.m4a', ''))).toBe('audio/mp4');
  });

  it('knows nothing of other kinds', () => {
    expect(classifyFile(file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toBeNull();
    expect(classifyFile(file('logo.svg', 'image/svg+xml'))).toBeNull();
    expect(classifyFile(file('archive.zip', ''))).toBeNull();
  });
});

describe('checkBeforeUpload', () => {
  it('passes a file within every limit', () => {
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg', 5 * MB), 'audio', limit(), heard(200))).toEqual({ ok: true });
    expect(checkBeforeUpload(file('a.pdf', 'application/pdf', MB), 'document', pdf, heard(null))).toEqual({ ok: true });
  });

  it('refuses a kind that is switched off', () => {
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg'), 'audio', limit({ enabled: false }), heard(10))).toEqual({
      ok: false,
      reason: 'type',
      limit: null,
    });
  });

  it('refuses a type the kind does not store', () => {
    expect(checkBeforeUpload(file('a.wav', 'audio/wav'), 'audio', limit(), heard(10))).toEqual({
      ok: false,
      reason: 'type',
      limit: null,
    });
    expect(checkBeforeUpload(file('a.mov', 'video/quicktime'), 'video', video, heard(10))).toMatchObject({
      reason: 'type',
    });
  });

  it('refuses a file over the size limit, naming the limit', () => {
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg', 15 * MB + 1), 'audio', limit(), heard(10))).toEqual({
      ok: false,
      reason: 'size',
      limit: 15 * MB,
    });
  });

  it('checks an image against what may be picked, not what is stored', () => {
    expect(checkBeforeUpload(file('a.png', 'image/png', 5 * MB), 'image', image, heard(null))).toEqual({ ok: true });
    expect(checkBeforeUpload(file('a.png', 'image/png', 20 * MB + 1), 'image', image, heard(null))).toEqual({
      ok: false,
      reason: 'size',
      limit: 20 * MB,
    });
  });

  it('refuses a recording longer than the limit, rounding up', () => {
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg'), 'audio', limit(), heard(600))).toEqual({ ok: true });
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg'), 'audio', limit(), heard(600.2))).toEqual({
      ok: false,
      reason: 'duration',
      limit: 600,
    });
  });

  it('refuses audio or video whose length cannot be read', () => {
    expect(checkBeforeUpload(file('a.mp3', 'audio/mpeg'), 'audio', limit(), heard(null))).toMatchObject({
      reason: 'unreadable',
    });
    expect(checkBeforeUpload(file('a.mp4', 'video/mp4'), 'video', video, heard(Infinity))).toMatchObject({
      reason: 'unreadable',
    });
  });

  it('refuses HEVC video and passes H.264', () => {
    expect(checkBeforeUpload(file('a.mp4', 'video/mp4'), 'video', video, { durationSeconds: 30, codec: 'hvc1' })).toEqual({
      ok: false,
      reason: 'codec',
      limit: null,
    });
    expect(checkBeforeUpload(file('a.mp4', 'video/mp4'), 'video', video, { durationSeconds: 30, codec: 'hev1' })).toMatchObject({
      reason: 'codec',
    });
    expect(checkBeforeUpload(file('a.mp4', 'video/mp4'), 'video', video, { durationSeconds: 30, codec: 'avc1' })).toEqual({
      ok: true,
    });
  });
});

describe('formatBytes', () => {
  it('counts a megabyte as a million bytes', () => {
    expect(formatBytes(312 * MB)).toBe('312 MB');
    expect(formatBytes(1_200_000)).toBe('1.2 MB');
    expect(formatBytes(850_000)).toBe('850 KB');
    expect(formatBytes(2 * MB)).toBe('2 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });
});

describe('formatDuration', () => {
  it('writes minutes and seconds, and hours when there are any', () => {
    expect(formatDuration(245)).toBe('4:05');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});
