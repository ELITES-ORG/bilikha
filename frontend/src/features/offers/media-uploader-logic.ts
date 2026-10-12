import type { MediaKind, MediaLimits } from '@contracts/media';
import { formatBytes, formatDuration, type RefusalReason } from '@/features/media/checks';
import type { MessageKey } from '@/i18n/catalogs/en';
import type { OwnOffer, OwnOfferImage, OwnOfferMediaItem } from './api';

/**
 * The offer editor's media section without React: what the file picker
 * offers, the sentence for a refused file, and the offer's items as one list.
 */

/** Pictures the browser can resize. HEIC is named by extension too: some browsers report no type for it. */
const IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', '.heic', '.heif'];

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

/** Whether audio, video or PDF can be added, or only images. */
export function acceptsOnlyImages(limits: MediaLimits | null): boolean {
  return !limits || OTHER_KINDS.every((kind) => !limits.destinations.offer[kind].enabled);
}

/** The file input's `accept`: images always, and each enabled kind's types. */
export function acceptAttribute(limits: MediaLimits | null): string {
  const accepted = [...IMAGE_ACCEPT];
  if (limits) {
    for (const kind of OTHER_KINDS) {
      const limit = limits.destinations.offer[kind];
      if (!limit.enabled) continue;
      for (const type of limit.mimeTypes) accepted.push(type, ...(EXTENSIONS[type] ?? []));
    }
  }
  return accepted.join(',');
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

/** Replaces each `{name}` with its value. The catalogue keeps every sentence whole. */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((out, [name, value]) => out.replace(`{${name}}`, value), text);
}

/**
 * The sentence for a refusal reason or an API error code. Anything else, an
 * upload that failed for no reason the creative can act on, reads as
 * "The upload stopped".
 */
export function refusalMessage(reason: string, context: RefusalContext, t: (key: MessageKey) => string): string {
  const key = (REFUSAL_KEYS as Readonly<Record<string, MessageKey>>)[reason];
  if (!key) return t('offers.media.failed');
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
