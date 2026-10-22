import type { MediaKind, MediaLimits } from '@contracts/media';
import { IMAGE_ACCEPT, acceptFor, formatBytes, formatDuration, type RefusalReason } from '@/features/media/checks';
import { fill } from '@/i18n/fill';
import type { MessageKey } from '@/i18n/catalogs/en';
import { ApiError } from '@/lib/api-client';
import type { OwnOffer, OwnOfferImage, OwnOfferMediaItem } from './api';

/**
 * The offer editor's media section without React: what the file picker
 * offers, the sentence for a refused file, and the offer's items as one list.
 */

const OTHER_KINDS = ['audio', 'video', 'document'] as const;

/** Whether audio, video or PDF can be added, or only images. */
export function acceptsOnlyImages(limits: MediaLimits | null): boolean {
  return !limits || OTHER_KINDS.every((kind) => !limits.destinations.offer[kind].enabled);
}

/** The file input's `accept`: images always, and each enabled kind's types. */
export function acceptAttribute(limits: MediaLimits | null): string {
  return limits ? acceptFor(limits.destinations.offer) : IMAGE_ACCEPT.join(',');
}

/** A refusal before upload, or the API code that refused it. */
export type Refusal = RefusalReason | 'MEDIA_LIMIT_REACHED' | 'MEDIA_QUOTA_EXCEEDED';

export interface RefusalContext {
  /** The picked file's size. */
  sizeBytes?: number;
  /** The picked file's length, as the browser read it. */
  durationSeconds?: number | null;
  /** The limit the file broke: bytes for size, seconds for duration. */
  limit?: number | null;
  /** Only images can be added, so a refused type names the image types. */
  imagesOnly?: boolean;
}

const REFUSAL_KEYS: Readonly<Record<Refusal, MessageKey>> = {
  type: 'offers.media.refused.type',
  size: 'offers.media.refused.size',
  duration: 'offers.media.refused.duration',
  codec: 'offers.media.refused.codec',
  unreadable: 'offers.media.refused.unreadable',
  MEDIA_LIMIT_REACHED: 'offers.media.refused.count',
  MEDIA_QUOTA_EXCEEDED: 'offers.media.refused.quota',
};

/**
 * The sentence for a refusal reason or an API error code. Anything else, an
 * upload that failed for no reason the creative can act on, reads as
 * "The upload stopped".
 */
export function refusalMessage(reason: string, context: RefusalContext, t: (key: MessageKey) => string): string {
  const key = (REFUSAL_KEYS as Readonly<Record<string, MessageKey>>)[reason];
  if (!key) return t('offers.media.failed');
  if (reason === 'type' && context.imagesOnly) return t('offers.media.refused.typeImagesOnly');
  if (reason === 'size') {
    return fill(t(key), {
      size: formatBytes(context.sizeBytes ?? 0),
      limit: formatBytes(context.limit ?? 0),
    });
  }
  if (reason === 'duration') {
    return fill(t(key), {
      length: formatDuration(context.durationSeconds ?? 0),
      limit: formatDuration(context.limit ?? 0),
    });
  }
  return t(key);
}

/** Where an upload was when it failed: still resizing an image in the browser, or sending it. */
export type UploadStage = 'preparing' | 'sending';

/**
 * The sentence for an upload that failed after its checks passed. A refusal
 * the catalogue words reads as that refusal, and any other API error as the
 * API's own message. An image the browser could not resize keeps the message
 * written for it (a HEIC that will not decode, say). Only a transfer that
 * broke off reads as "The upload stopped".
 */
export function uploadFailureMessage(error: unknown, stage: UploadStage, t: (key: MessageKey) => string): string {
  if (error instanceof ApiError) {
    return error.code in REFUSAL_KEYS ? refusalMessage(error.code, {}, t) : error.message;
  }
  if (stage === 'preparing' && error instanceof Error) return error.message;
  return t('offers.media.failed');
}

type ItemState = OwnOfferImage['state'];

export type OfferEditorItem =
  | { kind: 'image'; id: string; state: ItemState; stateLabel: MessageKey | null; image: OwnOfferImage }
  | {
      kind: OwnOfferMediaItem['kind'];
      id: string;
      state: ItemState;
      stateLabel: MessageKey | null;
      media: OwnOfferMediaItem;
    };

const STATE_LABELS: Readonly<Record<ItemState, MessageKey | null>> = {
  live: null,
  pending_add: 'offers.media.state.pendingAdd',
  pending_remove: 'offers.media.state.pendingRemove',
};

const bySortOrder = <T extends { sortOrder: number }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

/** Images first, then audio, video and PDFs, each in its own order. */
export function itemsForOffer(offer: Pick<OwnOffer, 'images' | 'media'>): OfferEditorItem[] {
  return [
    ...bySortOrder(offer.images).map((image): OfferEditorItem => ({
      kind: 'image',
      id: image.id,
      state: image.state,
      stateLabel: STATE_LABELS[image.state],
      image,
    })),
    ...bySortOrder(offer.media ?? []).map((media): OfferEditorItem => ({
      kind: media.kind,
      id: media.id,
      state: media.state,
      stateLabel: STATE_LABELS[media.state],
      media,
    })),
  ];
}

/** Whether the offer already holds as many of `kind` as it may. Items waiting to be removed do not count. */
export function isFull(offer: Pick<OwnOffer, 'images' | 'media'>, kind: MediaKind, limits: MediaLimits): boolean {
  const held = itemsForOffer(offer).filter((item) => item.kind === kind && item.state !== 'pending_remove').length;
  return held >= limits.destinations.offer[kind].perTarget;
}
