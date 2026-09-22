import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, ChevronRight, MapPin } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton, useToast } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useEnsureConversation } from '@/features/conversations/api';
import { OfferGallery } from '@/features/offers/OfferGallery';
import { OfferNotFoundError, usePublishedOffer } from '@/features/offers/api';
import {
  useSaveOffer,
  useSavedOffers,
  useUnsaveOffer,
} from '@/features/me/saved-offers';
import { formatPriceRange } from '@/lib/money';
import {
  fixedOfferActionDockAboveNav,
  fixedOfferActionDockGuest,
  pbBottomNav,
  pbOfferActionDock,
  pbOfferActionDockGuest,
} from '@/lib/bottom-nav';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
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
  const [inquiring, setInquiring] = useState(false);

  const isSaved =
    Boolean(id) &&
    (saved.data?.some((row) => row.offer.id === id) ?? false);

  if (offer.isError && offer.error instanceof OfferNotFoundError) {
    return <NotFoundPage />;
  }

  const creativeName =
    offer.data?.creative.displayName ?? offer.data?.creative.slug ?? 'this creative';
  const profilePath = offer.data ? `/creatives/${offer.data.creative.slug}` : '/';
  const returnPath = id ? `/offers/${id}` : '/directory';
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const signedIn = Boolean(user);
  const mainPad = signedIn ? pbOfferActionDock : pbOfferActionDockGuest;
  const dockClass = signedIn ? fixedOfferActionDockAboveNav : fixedOfferActionDockGuest;
  const saving = saveOffer.isPending || unsaveOffer.isPending;

  async function onInquire() {
    if (!offer.data) return;
    if (!user) {
      void navigate(loginHref);
      return;
    }
    setInquiring(true);
    try {
      const thread = await ensure.mutateAsync({ profileSlug: offer.data.creative.slug });
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

  const inquireControl = user ? (
    <Button
      size="lg"
      fullWidth
      className="sm:w-auto"
      loading={inquiring || ensure.isPending}
      onClick={() => void onInquire()}
    >
      Inquire
    </Button>
  ) : (
    <ButtonLink to={loginHref} size="lg" fullWidth className="sm:w-auto">
      Inquire
    </ButtonLink>
  );

  const saveControl = user ? (
    <Button
      size="lg"
      variant="secondary"
      loading={saving}
      aria-pressed={isSaved}
      aria-label={isSaved ? 'Saved' : 'Save'}
      iconLeft={
        isSaved ? (
          <BookmarkCheck className="size-4" aria-hidden />
        ) : (
          <Bookmark className="size-4" aria-hidden />
        )
      }
      onClick={() => void onToggleSave().catch(() => undefined)}
    >
      {isSaved ? 'Saved' : 'Save'}
    </Button>
  ) : (
    <ButtonLink
      to={loginHref}
      size="lg"
      variant="secondary"
      iconLeft={<Bookmark className="size-4" aria-hidden />}
    >
      Save
    </ButtonLink>
  );

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={offer.data ? mainPad : pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          {offer.isPending && <OfferDetailSkeleton />}

          {offer.isError && (
            <p className="text-danger-700">{offer.error.message}</p>
          )}

          {offer.data && (
            <>
              <p className="u-eyebrow">{offer.data.subdomain.domain}</p>
              <h1 className="u-display mt-3 text-3xl text-ink sm:text-4xl">
                {offer.data.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{offer.data.subdomain.name}</Badge>
                <p className="text-base font-medium text-ink">
                  {formatPriceRange(offer.data.priceMinCentavos, offer.data.priceMaxCentavos)}
                </p>
              </div>

              <OfferGallery images={offer.data.images} offerTitle={offer.data.title} />

              {offer.data.description && (
                <section className="mt-10" aria-labelledby="offer-about">
                  <h2 id="offer-about" className="u-eyebrow">
                    About this offer
                  </h2>
                  <p className="mt-3 text-md text-ink text-pretty whitespace-pre-wrap">
                    {offer.data.description}
                  </p>
                </section>
              )}

              <Link
                to={profilePath}
                className={cn(
                  'mt-10 flex items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-3',
                  'transition-colors hover:bg-clay-50',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700',
                )}
              >
                <Avatar
                  src={offer.data.creative.avatarUrl}
                  name={creativeName}
                  size="md"
                />
                <span className="min-w-0 flex-1">
                  <span className="u-eyebrow block">Offered by</span>
                  <span className="mt-1 block text-base font-medium text-ink">
                    {creativeName}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {offer.data.creative.municipality}
                    {offer.data.creative.isNearby && (
                      <Badge tone="accent">Nearby</Badge>
                    )}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
              </Link>

              <div className={cn(dockClass, 'flex items-center gap-3')}>
                <div className="min-w-0 flex-1 sm:flex-none">{inquireControl}</div>
                {saveControl}
              </div>
            </>
          )}
        </Container>
      </main>
    </>
  );
}

function OfferDetailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="h-9 w-2/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-28" />
      </div>
      <Skeleton className="mt-4 aspect-[4/3] w-full" />
      <Skeleton className="mt-6 h-3 w-28" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/4" />
      <div className="mt-6 flex items-center gap-3 rounded-md border border-hairline px-3 py-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-12 flex-1 sm:w-36 sm:flex-none" />
        <Skeleton className="h-12 w-28" />
      </div>
    </div>
  );
}
