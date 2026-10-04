import { ImageOff } from 'lucide-react';
import { ProgressiveImage } from '@/components/ui';
import type { OfferImage } from '@/features/offers/api';

export function MediaFallback() {
  return <ImageOff className="size-8 text-ink-subtle" aria-hidden />;
}

export interface OfferGalleryGridProps {
  /** Every image on the offer; the grid shows the ones after the cover. */
  images: OfferImage[];
  offerTitle: string;
  onOpen: (imageId: string, button: HTMLButtonElement) => void;
}

/**
 * The images after the cover, three across. When there are more than three,
 * the third tile carries "+N" for the rest — they are all in the lightbox.
 */
export function OfferGalleryGrid({ images, offerTitle, onOpen }: OfferGalleryGridProps) {
  const rest = images.slice(1);
  if (rest.length === 0) return null;
  const shown = rest.slice(0, 3);
  const hidden = rest.length - shown.length;

  return (
    <ul className="grid grid-cols-3 gap-3">
      {shown.map((image, index) => {
        const ordinal = index + 2;
        const more = index === shown.length - 1 && hidden > 0;
        return (
          <li key={image.id}>
            <button
              type="button"
              aria-label={
                more
                  ? `Open image ${ordinal} of ${images.length}, and ${hidden} more`
                  : `Open image ${ordinal} of ${images.length}`
              }
              className="relative block w-full overflow-hidden rounded-lg"
              onClick={(event) => onOpen(image.id, event.currentTarget)}
            >
              <ProgressiveImage
                key={image.thumbUrl}
                src={image.thumbUrl}
                alt={`${offerTitle}, image ${ordinal}`}
                width={400}
                height={300}
                className="aspect-4/3 h-auto w-full max-w-full"
                imageClassName="object-cover"
                fallback={<MediaFallback />}
              />
              {more && (
                <span
                  className="absolute inset-0 grid place-items-center bg-scrim/60 text-xl font-bold text-on-primary"
                  aria-hidden="true"
                >
                  +{hidden}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
