import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { MEDIA_KINDS, UPLOAD_LIMITS, bucketFor, enabledKinds, normaliseMimeType } from './media.limits.js';

describe('media limits', () => {
  const kinds = env.MEDIA_UPLOAD_KINDS;

  afterEach(() => {
    env.MEDIA_UPLOAD_KINDS = kinds;
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
    for (const kind of MEDIA_KINDS) {
      const limit = UPLOAD_LIMITS.offer[kind];
      expect(limit.reservedBytes, kind).toBeGreaterThanOrEqual(limit.maxBytes);
    }
  });
});
