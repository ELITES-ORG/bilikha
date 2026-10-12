import type { MediaBadge } from '@contracts/media';
import type { MessageKey } from '@/i18n/catalogs/en';
import { formatDuration } from './checks';

const LABELS: Readonly<Record<MediaBadge['kind'], MessageKey>> = {
  audio: 'media.badge.audio',
  video: 'media.badge.video',
  document: 'media.badge.document',
};

/**
 * A card's word on an offer's media (ADR 0046): "Audio · 3:42" for one
 * recording, "2 · Video" for several, "PDF" for one document.
 */
export function mediaBadgeText(badge: MediaBadge, t: (key: MessageKey) => string): string {
  const label = t(LABELS[badge.kind]);
  if (badge.count > 1) return `${badge.count} · ${label}`;
  if (badge.durationSeconds !== null) return `${label} · ${formatDuration(badge.durationSeconds)}`;
  return label;
}
