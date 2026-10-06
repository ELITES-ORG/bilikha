import type { ReactNode } from 'react';
import { ArrowRight, Heart, MapPin } from 'lucide-react';
import { Avatar, Badge, ButtonLink, Card, Eyebrow, ProgressiveImage, Skeleton } from '@/components/ui';
import type { OfferImage } from '@/features/offers/api';
import { cn } from '@/lib/cn';
import { initialsFromName } from '@/lib/initials';

export interface OfferCardProvider {
  name: string;
  avatarUrl: string | null;
  municipality: string;
  /** Shown as a word, never as colour alone. */
  nearby?: boolean;
}

export interface OfferCardSave {
  saved: boolean;
  pending: boolean;
  onToggle: () => void;
}

export interface OfferCardProps {
  image: OfferImage | null;
  title: string;
  description: string | null;
  /** Domain — the eyebrow above the title. */
  eyebrow?: string;
  /** Sub-domain — the pill over the image. Omit when every card would repeat it. */
  category?: string;
  /** Already formatted with `formatPriceRange`; always present. */
  price: string;
  provider?: OfferCardProvider;
  /** Public cards: the offer page. Renders the "View offer" link. */
  href?: string;
  /** Only where saving exists for this viewer. */
  save?: OfferCardSave;
  /** Owner cards: the action row (Edit, more). Ignored when `href` is set. */
  footer?: ReactNode;
  /** Similar-offers strip: no description, tighter type. */
  compact?: boolean;
  /** Whose initials fill the no-photo panel when there is no `provider`. */
  fallbackName?: string;
  className?: string;
}

/** Navy panel with initials — what an offer with no photo shows instead. */
export function OfferImageFallback({ text, large = false }: { text: string; large?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-full items-center justify-center bg-primary font-bold text-on-primary tabular-nums',
        large ? 'text-5xl' : 'text-3xl',
      )}
      aria-hidden="true"
    >
      {initialsFromName(text)}
    </span>
  );
}

/** Heart over a card or a hero image. 44px, labelled, pressed when saved. */
export function SaveHeart({ save, className }: { save: OfferCardSave; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={save.saved}
      aria-label={save.saved ? 'Remove from saved' : 'Save offer'}
      disabled={save.pending}
      onClick={save.onToggle}
      className={cn(
        'interactive-press grid size-11 place-items-center rounded-full bg-surface text-ink shadow-sm',
        'hover:text-lawa-700 disabled:opacity-60',
        className,
      )}
    >
      <Heart
        className={cn('size-5', save.saved && 'fill-current text-palayok-500')}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * One offer in a grid. Public cards are clickable anywhere through the single
 * "View offer" link, stretched over the card with `after:inset-0` — the save
 * heart sits above that layer as a sibling, so no control is nested in a link.
 */
export function OfferCard({
  image,
  title,
  description,
  eyebrow,
  category,
  price,
  provider,
  href,
  save,
  footer,
  compact = false,
  fallbackName,
  className,
}: OfferCardProps) {
  const fallbackText = provider?.name ?? fallbackName ?? title;

  return (
    <Card
      as="li"
      className={cn(
        'group relative flex flex-col overflow-hidden transition-colors hover:border-lawa-300',
        className,
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden">
        {image ? (
          <ProgressiveImage
            key={image.thumbUrl}
            src={image.thumbUrl}
            alt={`Cover image for ${title}`}
            width={400}
            height={300}
            className="size-full transition-transform duration-300 motion-safe:group-hover:scale-103"
            imageClassName="object-cover"
            fallback={<OfferImageFallback text={fallbackText} />}
          />
        ) : (
          <OfferImageFallback text={fallbackText} />
        )}
        {category && (
          <div className="absolute inset-x-3 bottom-3 flex">
            {/* Navy on a photo; the light pill on the navy no-photo panel. */}
            <Badge tone="brand" variant={image ? 'solid' : 'soft'} className="truncate">
              {category}
            </Badge>
          </div>
        )}
      </div>

      {save && <SaveHeart save={save} className="absolute top-3 right-3 z-10" />}

      <div className={cn('flex flex-1 flex-col', compact ? 'p-4' : 'p-5')}>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h3
          className={cn(
            'u-display line-clamp-2 break-words text-ink',
            compact ? 'text-md' : 'text-xl',
          )}
          title={title}
        >
          {title}
        </h3>
        <p
          className={cn('mt-1 font-bold text-ink', compact ? 'text-sm' : 'text-md')}
          data-numeric
        >
          {price}
        </p>

        {provider && (
          <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-4">
            <Avatar src={provider.avatarUrl} name={provider.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{provider.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <MapPin className="size-3 text-palayok-500" aria-hidden="true" />
                <span>{provider.municipality}</span>
                {provider.nearby && <span>· Nearby</span>}
              </p>
            </div>
          </div>
        )}

        {description && !compact && (
          <p className="mt-4 line-clamp-3 text-sm text-ink-muted">{description}</p>
        )}

        {href && (
          <div className={cn('mt-auto', compact ? 'pt-4' : 'pt-5')}>
            <ButtonLink
              to={href}
              size={compact ? 'sm' : 'md'}
              fullWidth
              iconRight={<ArrowRight className="size-4" aria-hidden="true" />}
              aria-label={`View offer: ${title}`}
              className="static after:absolute after:inset-0 after:rounded-md"
            >
              View offer
            </ButtonLink>
          </div>
        )}
      </div>

      {!href && footer && (
        <div className="flex items-center gap-2 border-t border-hairline px-5 py-3">{footer}</div>
      )}
    </Card>
  );
}

/** Same frame as `OfferCard`, so the grid does not jump when data arrives. */
export function OfferCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card as="li" className="overflow-hidden" aria-hidden="true">
      <Skeleton radius="xs" className="aspect-4/3 w-full rounded-none" />
      <div className={cn('space-y-3', compact ? 'p-4' : 'p-5')}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-28" />
        {!compact && <Skeleton className="mt-4 h-11 w-full" />}
      </div>
    </Card>
  );
}

/** The catalog grid: 1 column on phones, 2 from `sm`, 3 from `lg`. */
export const offerGridClass = 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3';
