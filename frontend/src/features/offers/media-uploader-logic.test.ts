import { describe, expect, it } from 'vitest';
import type { KindLimitView, MediaKind, MediaLimits } from '@contracts/media';
import type { MessageKey } from '@/i18n/catalogs/en';
import { enOffers } from '@/i18n/catalogs/offers/en';
import type { OwnOfferImage, OwnOfferMediaItem } from './api';
import {
  acceptAttribute,
  acceptsOnlyImages,
  isFull,
  itemsForOffer,
  refusalMessage,
} from './media-uploader-logic';

const MB = 1_000_000;

const kind = (overrides: Partial<KindLimitView>): KindLimitView => ({
  enabled: true,
  maxBytes: 10 * MB,
  maxPickedBytes: null,
  maxDurationSeconds: null,
  mimeTypes: [],
  perTarget: 3,
  transport: 'tus',
  ...overrides,
});

function limits(enabled: MediaKind[]): MediaLimits {
  return {
    quotaBytes: 1_000 * MB,
    destinations: {
      offer: {
        image: kind({ maxBytes: 2 * MB, maxPickedBytes: 20 * MB, mimeTypes: ['image/webp', 'image/jpeg'], perTarget: 10, transport: 'put' }),
        audio: kind({ enabled: enabled.includes('audio'), maxBytes: 15 * MB, maxDurationSeconds: 600, mimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'], perTarget: 5 }),
        video: kind({ enabled: enabled.includes('video'), maxBytes: 300 * MB, maxDurationSeconds: 300, mimeTypes: ['video/mp4', 'video/webm'], perTarget: 2 }),
        document: kind({ enabled: enabled.includes('document'), mimeTypes: ['application/pdf'], perTarget: 3 }),
      },
    },
  };
}

const t = (key: MessageKey) => (enOffers as Readonly<Record<string, string>>)[key] ?? key;

describe('acceptAttribute', () => {
  it('offers every kind, by type and extension, when every kind is enabled', () => {
    expect(acceptAttribute(limits(['audio', 'video', 'document'])).split(',')).toEqual([
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.heic', '.heif',
      'audio/mpeg', '.mp3', 'audio/mp4', '.m4a', 'audio/aac', '.aac', 'audio/ogg', '.ogg', '.opus',
      'video/mp4', '.mp4', 'video/webm', '.webm',
      'application/pdf', '.pdf',
    ]);
    expect(acceptsOnlyImages(limits(['audio', 'video', 'document']))).toBe(false);
  });

  it('offers images only when no other kind is enabled, or the limits are unavailable', () => {
    const imagesOnly = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
    expect(acceptAttribute(limits([]))).toBe(imagesOnly);
    expect(acceptAttribute(null)).toBe(imagesOnly);
    expect(acceptsOnlyImages(limits([]))).toBe(true);
    expect(acceptsOnlyImages(null)).toBe(true);
  });

  it('leaves out a kind that is switched off', () => {
    const accept = acceptAttribute(limits(['audio']));
    expect(accept).toContain('audio/mpeg');
    expect(accept).not.toContain('video/mp4');
    expect(accept).not.toContain('.pdf');
  });
});

describe('refusalMessage', () => {
  it('names the file size and the limit for a file too large', () => {
    expect(refusalMessage('size', { sizeBytes: 312 * MB, limit: 300 * MB }, t)).toBe(
      'This file is 312 MB. This kind can be up to 300 MB.',
    );
  });

  it('names the length and the limit for a recording too long', () => {
    expect(refusalMessage('duration', { durationSeconds: 754, limit: 600 }, t)).toBe(
      'This recording is 12:34 long. This kind can be up to 10:00.',
    );
  });

  it.each([
    ['type', 'This file type can’t be added. Use MP3, M4A or OGG audio, MP4 or WebM video, or a PDF.'],
    ['codec', 'This video uses a format many phones can’t play. Export it as MP4 (H.264) and try again.'],
    ['unreadable', 'This file couldn’t be read. Try another copy.'],
    ['MEDIA_LIMIT_REACHED', 'This offer already has as many of these as it can hold.'],
    ['MEDIA_QUOTA_EXCEEDED', 'Your storage is full. Remove something first.'],
  ])('reads %s as its sentence', (reason, sentence) => {
    expect(refusalMessage(reason, {}, t)).toBe(sentence);
  });

  it('reads any other failure as an upload that stopped', () => {
    expect(refusalMessage('MEDIA_VERIFICATION_FAILED', {}, t)).toBe('The upload stopped. Try again.');
    expect(refusalMessage('UNKNOWN', {}, t)).toBe('The upload stopped. Try again.');
  });
});

const image = (id: string, sortOrder: number, state: OwnOfferImage['state'] = 'live'): OwnOfferImage => ({
  id,
  url: `https://storage.test/${id}.webp`,
  thumbUrl: `https://storage.test/${id}-thumb.webp`,
  sortOrder,
  state,
});

const media = (
  id: string,
  kind: OwnOfferMediaItem['kind'],
  sortOrder: number,
  state: OwnOfferMediaItem['state'] = 'live',
): OwnOfferMediaItem => ({
  id,
  kind,
  url: `https://storage.test/${id}`,
  posterUrl: null,
  title: null,
  mimeType: 'audio/mpeg',
  sizeBytes: MB,
  durationSeconds: 60,
  sortOrder,
  state,
});

describe('itemsForOffer', () => {
  it('lists images first, then the other media, each by its order', () => {
    const items = itemsForOffer({
      images: [image('img-b', 3), image('img-a', 1)],
      media: [media('pdf', 'document', 4), media('song', 'audio', 2), media('clip', 'video', 5)],
    });
    expect(items.map((item) => item.id)).toEqual(['img-a', 'img-b', 'song', 'pdf', 'clip']);
    expect(items.map((item) => item.kind)).toEqual(['image', 'image', 'audio', 'document', 'video']);
  });

  it('labels each item that waits for review, and nothing that is live', () => {
    const items = itemsForOffer({
      images: [image('kept', 0), image('added', 1, 'pending_add')],
      media: [media('going', 'audio', 2, 'pending_remove')],
    });
    expect(items.map((item) => item.stateLabel)).toEqual([
      null,
      'offers.media.state.pendingAdd',
      'offers.media.state.pendingRemove',
    ]);
  });

  it('reads an API without media as images only', () => {
    expect(itemsForOffer({ images: [image('only', 0)] }).map((item) => item.id)).toEqual(['only']);
  });
});

describe('isFull', () => {
  it('counts the kind, leaving out items waiting to be removed', () => {
    const all = limits(['audio', 'video', 'document']);
    const offer = {
      images: [],
      media: [media('a', 'video', 0), media('b', 'video', 1, 'pending_remove'), media('c', 'audio', 2)],
    };
    expect(isFull(offer, 'video', all)).toBe(false);
    expect(isFull({ ...offer, media: [...offer.media, media('d', 'video', 3, 'pending_add')] }, 'video', all)).toBe(true);
  });
});
