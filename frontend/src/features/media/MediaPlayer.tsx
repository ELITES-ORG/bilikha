import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { OfferMediaItem } from '@contracts/media';
import type { MessageKey } from '@/i18n/catalogs/en';
import { useT } from '@/i18n/i18n-context';
import { formatBytes, formatDuration } from './checks';

/**
 * An offer's audio, video and PDF on its page (ADR 0046). Nothing downloads
 * until it is played or opened: data is the scarce thing here, so each item
 * says how big and how long it is first, and never plays by itself.
 */

const KIND_LABELS: Readonly<Record<OfferMediaItem['kind'], MessageKey>> = {
  audio: 'media.badge.audio',
  video: 'media.badge.video',
  document: 'media.badge.document',
};

/** "4.2 MB · 3:42": what playing it costs, before it is played. */
function facts(item: OfferMediaItem): string {
  return [
    formatBytes(item.sizeBytes),
    ...(item.durationSeconds !== null ? [formatDuration(item.durationSeconds)] : []),
  ].join(' · ');
}

function Caption({ item, title }: { item: OfferMediaItem; title: string }) {
  return (
    <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="min-w-0 font-semibold break-words text-ink">{title}</span>
      <span className="text-sm text-ink-muted" data-numeric>
        {facts(item)}
      </span>
    </figcaption>
  );
}

export function AudioItem({ item }: { item: OfferMediaItem }) {
  const t = useT();
  const title = item.title ?? t(KIND_LABELS.audio);
  return (
    <figure className="space-y-2">
      <Caption item={item} title={title} />
      <audio controls preload="none" src={item.url} aria-label={title} className="w-full" />
    </figure>
  );
}

export function VideoItem({ item }: { item: OfferMediaItem }) {
  const t = useT();
  const title = item.title ?? t(KIND_LABELS.video);
  const [started, setStarted] = useState(false);
  return (
    <figure className="space-y-2">
      <Caption item={item} title={title} />
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface-sunken short:aspect-auto short:h-48">
        <video
          controls
          preload="none"
          playsInline
          poster={item.posterUrl ?? undefined}
          src={item.url}
          aria-label={title}
          className="size-full object-contain"
          onPlay={() => setStarted(true)}
        />
        {!item.posterUrl && !started && (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink-muted"
            aria-hidden="true"
          >
            {t('media.noPoster')}
          </span>
        )}
      </div>
    </figure>
  );
}

export function DocumentLink({ item }: { item: OfferMediaItem }) {
  const t = useT();
  const title = item.title ?? t(KIND_LABELS.document);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener"
      className="flex min-h-11 items-center gap-3 rounded-md border border-hairline px-4 py-3 hover:bg-surface-sunken"
    >
      <FileText className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-ink">{title}</span>
        <span className="block text-sm text-ink-muted" data-numeric>
          {facts(item)}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-navy-700">{t('media.openPdf')}</span>
    </a>
  );
}
