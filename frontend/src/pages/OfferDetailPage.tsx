import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ContactComposer } from '@/features/conversations/ContactComposer';
import { OfferNotFoundError, usePublishedOffer } from '@/features/offers/api';
import { formatPriceRange } from '@/lib/money';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const offer = usePublishedOffer(id);
  const { data: user } = useCurrentUser();
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const lightboxItem = offer.data?.images.find((image) => image.id === lightboxId) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxItem) {
      if (!dialog.open) dialog.showModal();
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

  if (offer.isError && offer.error instanceof OfferNotFoundError) {
    return <NotFoundPage />;
  }

  const creativeName =
    offer.data?.creative.displayName ?? offer.data?.creative.slug ?? 'this creative';
  const profilePath = offer.data ? `/creatives/${offer.data.creative.slug}` : '/';
  const returnPath = id ? `/offers/${id}` : '/directory';
  const initialMessage = offer.data ? `I'm interested in "${offer.data.title}".` : undefined;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          {offer.isPending && (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {offer.isError && <p className="text-danger-700">{offer.error.message}</p>}

          {offer.data && (
            <>
              <p className="u-eyebrow">{offer.data.subdomain.domain}</p>
              <h1 className="u-display mt-3 text-4xl text-ink">{offer.data.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{offer.data.subdomain.name}</Badge>
                <p className="text-base font-medium text-ink">
                  {formatPriceRange(offer.data.priceMinCentavos, offer.data.priceMaxCentavos)}
                </p>
              </div>

              {offer.data.description && (
                <p className="mt-8 text-md text-ink text-pretty whitespace-pre-wrap">
                  {offer.data.description}
                </p>
              )}

              {offer.data.images.length > 0 && (
                <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {offer.data.images.map((image) => (
                    <li key={image.id}>
                      <button
                        type="button"
                        className="block w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700"
                        onClick={(event) => openLightbox(image.id, event.currentTarget)}
                      >
                        <img
                          src={image.thumbUrl}
                          alt=""
                          width={400}
                          height={400}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-10 flex items-center gap-4 border-t border-hairline pt-8">
                <Avatar
                  src={offer.data.creative.avatarUrl}
                  name={creativeName}
                  size="md"
                />
                <div>
                  <Link
                    to={profilePath}
                    className="link-underline text-base font-medium text-lawa-700"
                  >
                    {creativeName}
                  </Link>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                    <MapPin className="size-3.5" aria-hidden />
                    {offer.data.creative.municipality}
                    {offer.data.creative.isNearby && (
                      <Badge tone="accent">Nearby</Badge>
                    )}
                  </p>
                </div>
              </div>

              <div className="u-rule my-12" />

              {!composerOpen && (
                <div>
                  {user ? (
                    <Button size="lg" onClick={() => setComposerOpen(true)}>
                      Contact about this offer
                    </Button>
                  ) : (
                    <ButtonLink
                      to={`/login?next=${encodeURIComponent(returnPath)}`}
                      size="lg"
                    >
                      Sign in to contact
                    </ButtonLink>
                  )}
                </div>
              )}

              {user && composerOpen && (
                <ContactComposer
                  profileSlug={offer.data.creative.slug}
                  creativeName={creativeName}
                  initialMessage={initialMessage}
                  onCancel={() => setComposerOpen(false)}
                />
              )}
            </>
          )}
        </Container>
      </main>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] max-w-3xl border-0 bg-transparent p-0 backdrop:bg-ink/70"
        onClose={closeLightbox}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeLightbox();
        }}
      >
        {lightboxItem && (
          <img
            src={lightboxItem.url}
            alt=""
            className="max-h-[85vh] w-auto max-w-full"
          />
        )}
      </dialog>
    </>
  );
}
