import type { ReactNode } from 'react';
import { ArrowRight, FileText, Film, Heart, MapPin, Music } from 'lucide-react';
import type { MediaBadge } from '@contracts/media';
import { Avatar, Badge, ButtonLink, Card, Eyebrow, ProgressiveImage, Skeleton } from '@/components/ui';
import { mediaBadgeText } from '@/features/media/badge';
import type { OfferImage } from '@/features/offers/api';
import { useT } from '@/i18n/i18n-context';
import { cn } from '@/lib/cn';
import { initialsFromName } from '@/lib/initials';

const MEDIA_ICONS = { audio: Music, video: Film, document: FileText } as const;

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
  /** Sub-domain — the pill over the image, as the singular label for this one
   *  offer: `subdomainLabel(offer.subdomain)`. Omit when every card would repeat it. */
  category?: string;
  /** Already formatted with `formatPriceRange`; always present. */
  price: string;
  /** Audio, video or PDF on the offer (ADR 0046): a label beside the category, never a player. */
  mediaBadge?: MediaBadge | null;
  provider?: OfferCardProvider;
  /** Public cards: the offer page. Renders the "View offer" link. */
  href?: string;
  /** Only where saving exists for this viewer. */
  save?: OfferCardSave;
  /** Owner cards: the action row (Edit, more). Ignored when `href` is set. */
  footer?: ReactNode;
  /** Owner cards: where the offer stands in review, above the action row. */
  notice?: ReactNode;
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
        'interactive-press grid size-11 place-items-center rounded-sm bg-surface text-ink shadow-sm',
        'hover:text-navy-700 disabled:opacity-60',
        className,
      )}
    >
      <Heart
        className={cn('size-5', save.saved && 'fill-current text-red-500')}
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
  mediaBadge,
  provider,
  href,
  save,
  footer,
  notice,
  compact = false,
  fallbackName,
  className,
}: OfferCardProps) {
  const t = useT();
  const fallbackText = provider?.name ?? fallbackName ?? title;
  const MediaIcon = mediaBadge ? MEDIA_ICONS[mediaBadge.kind] : null;

  return (
    <Card
      as="li"
      className={cn(
        'group relative flex flex-col overflow-hidden transition-colors hover:border-navy-300',
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
        {(category || mediaBadge) && (
          <div className="absolute inset-x-3 bottom-3 flex min-w-0 gap-2">
            {/* Navy on a photo; the light pill on the navy no-photo panel. */}
            {category && (
              <Badge tone="brand" variant={image ? 'solid' : 'soft'} className="min-w-0 truncate">
                {category}
              </Badge>
            )}
            {mediaBadge && MediaIcon && (
              <Badge
                className="shrink-0"
                icon={<MediaIcon className="size-3" aria-hidden="true" />}
                data-numeric
              >
                {mediaBadgeText(mediaBadge, t)}
              </Badge>
            )}
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
                <MapPin className="size-3 text-red-500" aria-hidden="true" />
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

      {!href && notice && <div className="border-t border-hairline px-5 py-3">{notice}</div>}

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
