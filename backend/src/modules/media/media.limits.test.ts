import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import type { UploadDestination } from '../../contracts/media.js';
import {
  FILES_PER_MESSAGE,
  MB,
  MEDIA_KINDS,
  UPLOAD_LIMITS,
  bucketFor,
  enabledKinds,
  isPrivateDestination,
  normaliseMimeType,
} from './media.limits.js';

const DESTINATIONS: UploadDestination[] = ['offer', 'message'];

describe('media limits', () => {
  const kinds = env.MEDIA_UPLOAD_KINDS;
  const messageAttachments = env.MESSAGE_ATTACHMENTS;

  afterEach(() => {
    env.MEDIA_UPLOAD_KINDS = kinds;
    env.MESSAGE_ATTACHMENTS = messageAttachments;
  });

  it('maps the browser aliases to one name, lower-cased and without parameters', () => {
    expect(normaliseMimeType('audio/x-m4a')).toBe('audio/mp4');
    expect(normaliseMimeType('audio/mp3')).toBe('audio/mpeg');
    expect(normaliseMimeType('audio/opus')).toBe('audio/ogg');
    expect(normaliseMimeType('audio/x-aac')).toBe('audio/aac');
    expect(normaliseMimeType('Video/MP4')).toBe('video/mp4');
    expect(normaliseMimeType('audio/mpeg; codecs=x')).toBe('audio/mpeg');
  });

  it('names each kind its own bucket beside the media bucket', () => {
    expect(bucketFor('image')).toBe('media');
    expect(bucketFor('video')).toBe('media-video');
  });

  it('enables images only when the switch is empty', () => {
    env.MEDIA_UPLOAD_KINDS = [];

    expect(enabledKinds()).toEqual(['image']);
  });

  it('reserves at least the largest file of every kind', () => {
    for (const destination of DESTINATIONS) {
      for (const kind of MEDIA_KINDS) {
        const limit = UPLOAD_LIMITS[destination][kind];
        expect(limit.reservedBytes, `${destination} ${kind}`).toBeGreaterThanOrEqual(limit.maxBytes);
      }
    }
  });

  describe('messages (ADR 0060)', () => {
    it("carries #66's caps: an offer's, but a shorter video, five files a message", () => {
      const limits = UPLOAD_LIMITS.message;

      expect(limits.image).toMatchObject({ maxBytes: 2 * MB, maxPickedBytes: 20 * MB, transport: 'put' });
      expect(limits.audio).toMatchObject({ maxBytes: 15 * MB, maxDurationSeconds: 600, transport: 'tus' });
      expect(limits.video).toMatchObject({ maxBytes: 100 * MB, maxDurationSeconds: 180, transport: 'tus' });
      expect(limits.document).toMatchObject({ maxBytes: 10 * MB, mimeTypes: ['application/pdf'], transport: 'tus' });
      for (const kind of MEDIA_KINDS) expect(limits[kind].perTarget, kind).toBe(5);
      expect(FILES_PER_MESSAGE).toBe(5);
    });

    it('keeps message files in their own private buckets, one per kind', () => {
      expect(bucketFor('image', 'message')).toBe('media-messages');
      expect(bucketFor('audio', 'message')).toBe('media-messages-audio');
      expect(bucketFor('video', 'message')).toBe('media-messages-video');
      expect(bucketFor('document', 'message')).toBe('media-messages-documents');
      expect(isPrivateDestination('message')).toBe(true);
      expect(isPrivateDestination('offer')).toBe(false);
    });

    it('enables every kind or none as MESSAGE_ATTACHMENTS says, whatever MEDIA_UPLOAD_KINDS says', () => {
      env.MEDIA_UPLOAD_KINDS = [];
      env.MESSAGE_ATTACHMENTS = false;
      expect(enabledKinds('message')).toEqual([]);

      env.MESSAGE_ATTACHMENTS = true;
      expect(enabledKinds('message')).toEqual([...MEDIA_KINDS]);
      expect(enabledKinds()).toEqual(['image']);
    });
  });
});
