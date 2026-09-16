import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton, useToast } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useEnsureConversation } from '@/features/conversations/api';
import { OfferNotFoundError, usePublishedOffer } from '@/features/offers/api';
import {
  useSaveOffer,
  useSavedOffers,
  useUnsaveOffer,
} from '@/features/me/saved-offers';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const offer = usePublishedOffer(id);
  const { data: user } = useCurrentUser();
  const ensure = useEnsureConversation();
  const saveOffer = useSaveOffer();
  const unsaveOffer = useUnsaveOffer();
  const saved = useSavedOffers(Boolean(user));
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [inquiring, setInquiring] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const lightboxItem = offer.data?.images.find((image) => image.id === lightboxId) ?? null;
  const isSaved =
    Boolean(id) &&
    (saved.data?.some((row) => row.offer.id === id) ?? false);

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
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;

  async function onInquire() {
    if (!offer.data) return;
    if (!user) {
      void navigate(loginHref);
      return;
    }
    setInquiring(true);
    try {
      const thread = await ensure.mutateAsync(offer.data.creative.slug);
      void navigate(`/messages/${thread.id}?offerId=${encodeURIComponent(offer.data.id)}`);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setInquiring(false);
    }
  }

  async function onToggleSave() {
    if (!id) return;
    if (!user) {
      void navigate(loginHref);
      return;
    }
    if (isSaved) {
      await toast.run(
        'Removing…',
        () => unsaveOffer.mutateAsync(id),
        {
          success: 'Removed from saved',
          error: (err) => toApiError(err).message,
        },
      );
    } else {
      await toast.run(
        'Saving…',
        () => saveOffer.mutateAsync(id),
        {
          success: 'Saved',
          error: (err) => toApiError(err).message,
        },
      );
    }
  }

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
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

              <div className="flex flex-wrap gap-3">
                {user ? (
                  <Button
                    size="lg"
                    loading={inquiring || ensure.isPending}
                    onClick={() => void onInquire()}
                  >
                    Inquire
                  </Button>
                ) : (
                  <ButtonLink to={loginHref} size="lg">
                    Inquire
                  </ButtonLink>
                )}
                {user ? (
                  <Button
                    size="lg"
                    variant="secondary"
                    loading={saveOffer.isPending || unsaveOffer.isPending}
                    onClick={() => void onToggleSave().catch(() => undefined)}
                  >
                    {isSaved ? 'Saved' : 'Save'}
                  </Button>
                ) : (
                  <ButtonLink to={loginHref} size="lg" variant="secondary">
                    Save
                  </ButtonLink>
                )}
              </div>
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
