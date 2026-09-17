import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatPriceRange } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { MessageOffer } from './types';

type OfferCardData = {
  id: string;
  title: string;
  priceMinCentavos: number | null;
  priceMaxCentavos: number | null;
  image: { url?: string; thumbUrl: string } | null;
};

interface OfferCardProps {
  offer: OfferCardData;
  /** Visual tone when nested in a self/other message bubble. */
  tone?: 'default' | 'onPrimary' | 'onSurface';
  className?: string;
  /** Extra content under the price (e.g. detach control). */
  footer?: ReactNode;
}

export function OfferCard({ offer, tone = 'default', className, footer }: OfferCardProps) {
  const thumb = offer.image?.thumbUrl;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-sm border',
        tone === 'onPrimary' && 'border-primary/40 bg-primary-active/40',
        tone === 'onSurface' && 'border-hairline bg-clay-50',
        tone === 'default' && 'border-hairline bg-surface',
        className,
      )}
    >
      <Link
        to={`/offers/${offer.id}`}
        className="flex gap-3 p-2 transition-opacity hover:opacity-90"
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            width={56}
            height={56}
            className="size-14 shrink-0 object-cover"
          />
        ) : (
          <div className="size-14 shrink-0 bg-clay-100" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-sm font-medium',
              tone === 'onPrimary' ? 'text-on-primary' : 'text-ink',
            )}
          >
            {offer.title}
          </p>
          <p
            className={cn(
              'mt-0.5 text-xs',
              tone === 'onPrimary' ? 'text-on-primary-muted' : 'text-ink-muted',
            )}
          >
            {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
          </p>
        </div>
      </Link>
      {footer}
    </div>
  );
}

export function OfferUnavailableNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-ink-muted', className)}>This offer is no longer listed</p>
  );
}

/** Renders a message's offer attachment, or the unavailable notice. */
export function MessageOfferBlock({
  offer,
  offerRemoved,
  fromSelf,
}: {
  offer: MessageOffer | null;
  offerRemoved?: boolean;
  fromSelf: boolean;
}) {
  if (offer) {
    return (
      <div className="mb-2">
        <OfferCard offer={offer} tone={fromSelf ? 'onPrimary' : 'onSurface'} />
      </div>
    );
  }
  if (offerRemoved) {
    return (
      <div className="mb-2">
        <OfferUnavailableNotice
          className={fromSelf ? 'text-on-primary-muted' : undefined}
        />
      </div>
    );
  }
  return null;
}
