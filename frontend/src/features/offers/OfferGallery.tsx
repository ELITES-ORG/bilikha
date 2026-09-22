import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { ProgressiveImage } from '@/components/ui';
import type { OfferImage } from '@/features/offers/api';
import { adjacentImageId } from '@/features/offers/offer-gallery-state';
import { cn } from '@/lib/cn';

export interface OfferGalleryProps {
  images: OfferImage[];
  /** Used only in accessible names — work samples have no author alt text yet. */
  offerTitle: string;
}

function mediaFallback() {
  return <ImageOff className="size-8 text-ink-subtle" aria-hidden />;
}

/**
 * Offer work samples: one full-width hero, optional thumbnail rail, and a
 * labelled lightbox that owns previous/next wrapping via {@link adjacentImageId}.
 */
export function OfferGallery({ images, offerTitle }: OfferGalleryProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const imageIds = images.map((image) => image.id);
  const lightboxIndex = lightboxId == null ? -1 : imageIds.indexOf(lightboxId);
  const lightboxItem =
    lightboxIndex >= 0 ? (images[lightboxIndex] ?? null) : null;
  const lightboxPosition = lightboxIndex >= 0 ? lightboxIndex + 1 : 0;
  const canNavigate = images.length > 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxItem) {
      if (!dialog.open) dialog.showModal();
      queueMicrotask(() => closeRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
    }
  }, [lightboxItem]);

  function openLightbox(imageId: string, button: HTMLButtonElement) {
    triggerRef.current = button;
    setLightboxId(imageId);
  }

  function closeLightbox() {
    setLightboxId(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function go(direction: 'previous' | 'next') {
    if (!lightboxId) return;
    const nextId = adjacentImageId(imageIds, lightboxId, direction);
    if (nextId) setLightboxId(nextId);
  }

  if (images.length === 0) return null;

  const [hero, ...rest] = images;

  return (
    <div className="mt-8">
      <button
        type="button"
        aria-label={`Open work sample 1 of ${images.length}: ${offerTitle}`}
        className="block w-full overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700"
        onClick={(event) => openLightbox(hero!.id, event.currentTarget)}
      >
        <ProgressiveImage
          key={hero!.thumbUrl}
          src={hero!.thumbUrl}
          alt=""
          width={1200}
          height={900}
          loading="eager"
          fetchPriority="high"
          className="aspect-[4/3] h-auto w-full max-w-full"
          imageClassName="object-contain"
          fallback={mediaFallback()}
        />
      </button>

      {rest.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {rest.map((image, index) => {
            const ordinal = index + 2;
            return (
              <li key={image.id}>
                <button
                  type="button"
                  aria-label={`Open work sample ${ordinal} of ${images.length}: ${offerTitle}`}
                  className="block w-full overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700"
                  onClick={(event) => openLightbox(image.id, event.currentTarget)}
                >
                  <ProgressiveImage
                    key={image.thumbUrl}
                    src={image.thumbUrl}
                    alt=""
                    width={400}
                    height={400}
                    className="aspect-square h-auto w-full max-w-full"
                    imageClassName="object-cover"
                    fallback={mediaFallback()}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className={cn(
          'm-auto max-h-[min(92vh,56rem)] w-[min(100%-1.5rem,48rem)] border-0 bg-transparent p-0',
          'backdrop:bg-ink/70',
        )}
        onClose={closeLightbox}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeLightbox();
        }}
        onKeyDown={(event) => {
          if (!canNavigate) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            go('previous');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            go('next');
          }
        }}
      >
        {lightboxItem && (
          <div className="flex flex-col gap-3 rounded-md bg-paper p-3 shadow-xl sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p id={titleId} className="text-sm font-medium text-ink">
                Work sample {lightboxPosition} of {images.length}
              </p>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-clay-100 hover:text-ink"
                aria-label="Close"
                onClick={closeLightbox}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <ProgressiveImage
              key={lightboxItem.url}
              src={lightboxItem.url}
              alt=""
              width={1600}
              height={1200}
              loading="eager"
              className="mx-auto aspect-[4/3] h-auto max-h-[70vh] w-full max-w-full"
              imageClassName="object-contain"
              fallback={mediaFallback()}
            />

            {canNavigate && (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink hover:bg-clay-100"
                  onClick={() => go('previous')}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  Previous
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink hover:bg-clay-100"
                  onClick={() => go('next')}
                >
                  Next
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
