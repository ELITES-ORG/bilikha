import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ProgressiveImage } from '@/components/ui';
import type { OfferImage } from '@/features/offers/api';
import { adjacentImageId } from '@/features/offers/offer-gallery-state';
import { cn } from '@/lib/cn';
import { MediaFallback } from './OfferGallery';

/**
 * The lightbox for an offer's images, opened from anywhere on the page — the
 * cover and the gallery tiles share it. A native modal `<dialog>`: Escape
 * closes it and focus stays inside; on close, focus returns to whatever
 * opened it. Previous/next wrap via {@link adjacentImageId}.
 */
export function useOfferLightbox(images: OfferImage[]) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const imageIds = images.map((image) => image.id);
  const lightboxIndex = lightboxId == null ? -1 : imageIds.indexOf(lightboxId);
  const lightboxItem = lightboxIndex >= 0 ? (images[lightboxIndex] ?? null) : null;
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

  function open(imageId: string, button: HTMLButtonElement) {
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

  const lightbox = (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={cn(
        'm-auto max-h-[min(92vh,56rem)] w-[min(100%-1.5rem,48rem)] border-0 bg-transparent p-0',
        'backdrop:bg-scrim/70',
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
              Image {lightboxPosition} of {images.length}
            </p>
            <button
              ref={closeRef}
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-clay-100 hover:text-ink"
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
            className="mx-auto aspect-4/3 h-auto max-h-[70vh] w-full max-w-full"
            imageClassName="object-contain"
            fallback={<MediaFallback />}
          />

          {canNavigate && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink hover:bg-clay-100"
                onClick={() => go('previous')}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-ink hover:bg-clay-100"
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
  );

  return { open, lightbox };
}
