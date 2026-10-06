import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, MapPin, Share2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  Eyebrow,
  ProgressiveImage,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RatingScore } from '@/features/ratings/components/RatingScore';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useEnsureConversation } from '@/features/conversations/api';
import { OfferCard, OfferCardSkeleton, OfferImageFallback, SaveHeart } from '@/features/offers/OfferCard';
import { OfferGalleryGrid } from '@/features/offers/OfferGallery';
import { useOfferLightbox } from '@/features/offers/use-offer-lightbox';
import {
  OfferNotFoundError,
  usePublishedOffer,
  usePublishedOffers,
  type PublishedOfferDetail,
} from '@/features/offers/api';
import {
  useSaveOffer,
  useSavedOffers,
  useUnsaveOffer,
} from '@/features/me/saved-offers';
import { useOfferSaving, type OfferSaving } from '@/features/me/use-offer-saving';
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

export function OfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const offer = usePublishedOffer(id);
  const { data: user } = useCurrentUser();
  const ensure = useEnsureConversation();
  const saveOffer = useSaveOffer();
  const unsaveOffer = useUnsaveOffer();
  const saved = useSavedOffers(Boolean(user));
  const [inquiring, setInquiring] = useState(false);
  // Same cached saved-offers list as above, for the similar-offer cards.
  const cardSaving = useOfferSaving(Boolean(user));
  const lightbox = useOfferLightbox(offer.data?.images ?? []);

  const isSaved =
    Boolean(id) &&
    (saved.data?.some((row) => row.offer.id === id) ?? false);

  if (offer.isError && offer.error instanceof OfferNotFoundError) {
    return (
      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <EmptyState
            title="This offer is no longer listed"
            description="It may have been removed by the creative. Others like it are in the directory."
            action={<ButtonLink to="/directory">Browse the directory</ButtonLink>}
          />
        </Container>
      </main>
    );
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
  const isOwner =
    Boolean(user?.profileSlug) && user?.profileSlug === offer.data?.creative.slug;
  // An in-app history entry exists unless this page was opened directly.
  const canGoBack = location.key !== 'default';

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

  async function onShare() {
    if (!offer.data) return;
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      // Dismissing the share sheet rejects; that is not an error to report.
      await navigator.share({ title: offer.data.title, url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  const inquireControl = isOwner ? (
    <ButtonLink to="/account/offers" size="lg" fullWidth className="sm:w-auto lg:w-full">
      Edit offer
    </ButtonLink>
  ) : user ? (
    <Button
      size="lg"
      fullWidth
      className="sm:w-auto lg:w-full"
      loading={inquiring || ensure.isPending}
      onClick={() => void onInquire()}
    >
      Inquire now
    </Button>
  ) : (
    <ButtonLink to={loginHref} size="lg" fullWidth className="sm:w-auto lg:w-full">
      Inquire now
    </ButtonLink>
  );

  const saveControl = isOwner ? null : user ? (
    <Button
      size="lg"
      variant="secondary"
      className="lg:w-full"
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
      className="lg:w-full"
      iconLeft={<Bookmark className="size-4" aria-hidden />}
    >
      Save
    </ButtonLink>
  );

  const data = offer.data;
  const cover = data?.images[0] ?? null;
  const price = data ? formatPriceRange(data.priceMinCentavos, data.priceMaxCentavos) : '';

  return (
    <>
      <RegistrationStatusBanner />

      <main className={data ? mainPad : pbBottomNav}>
        <Container width="wide" className="py-6 sm:py-10">
          {offer.isPending && <OfferDetailSkeleton />}

          {offer.isError && (
            <EmptyState
              title="Could not load this offer"
              description={offer.error.message}
              action={
                <Button variant="secondary" size="sm" onClick={() => void offer.refetch()}>
                  Try again
                </Button>
              }
            />
          )}

          {data && (
            <>
              {/* Hero. The cover is the LCP image: eager, high priority, and
                  a width-described srcset so a phone takes the thumb. */}
              <div className="relative aspect-video overflow-hidden rounded-lg bg-primary short:aspect-auto short:h-40 lg:aspect-21/9">
                {cover ? (
                  <button
                    type="button"
                    aria-label={`Open image 1 of ${data.images.length}`}
                    className="absolute inset-0"
                    onClick={(event) => lightbox.open(cover.id, event.currentTarget)}
                  >
                    <ProgressiveImage
                      key={cover.url}
                      src={cover.url}
                      srcSet={`${cover.thumbUrl} 400w, ${cover.url} 1600w`}
                      sizes="(min-width: 1024px) 66vw, 100vw"
                      alt={`Cover image for ${data.title}`}
                      width={1600}
                      height={900}
                      loading="eager"
                      fetchPriority="high"
                      className="size-full"
                      imageClassName="object-cover"
                      fallback={<OfferImageFallback text={creativeName} large />}
                    />
                  </button>
                ) : (
                  <OfferImageFallback text={creativeName} large />
                )}

                <div className="absolute top-3 left-3">
                  {canGoBack ? (
                    <button type="button" className={heroPill} onClick={() => void navigate(-1)}>
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Back
                    </button>
                  ) : (
                    <Link to="/directory" className={heroPill}>
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Back
                    </Link>
                  )}
                </div>

                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    type="button"
                    aria-label="Share this offer"
                    className="interactive-press grid size-11 place-items-center rounded-full bg-surface text-ink shadow-sm hover:text-lawa-700"
                    onClick={() => void onShare()}
                  >
                    <Share2 className="size-5" aria-hidden="true" />
                  </button>
                  {user && !isOwner && (
                    <SaveHeart
                      save={{
                        saved: isSaved,
                        pending: saving,
                        onToggle: () => void onToggleSave().catch(() => undefined),
                      }}
                    />
                  )}
                </div>

                <div className="absolute inset-x-3 bottom-3 flex">
                  <Badge tone="brand" variant={cover ? 'solid' : 'soft'} className="truncate">
                    {data.subdomain.name}
                  </Badge>
                </div>
              </div>

              {/* Three areas so that, on a phone, the sidebar lands under the
                  title; from lg it spans both rows on the right. */}
              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-x-10">
                <div className="min-w-0">
                  <Eyebrow>{data.subdomain.domain}</Eyebrow>
                  <h1 className="u-display mt-3 text-3xl break-words text-ink sm:text-4xl">
                    {data.title}
                  </h1>
                  <p className="mt-2 text-xl font-bold text-ink" data-numeric>
                    {price}
                  </p>
                </div>

                <aside
                  className="max-sm:contents lg:col-start-2 lg:row-span-2 lg:row-start-1"
                  aria-label="Price and actions"
                >
                  {/* On a phone the card dissolves: its only control row is the
                      fixed bar, and location is already in the creative row. */}
                  <Card className="p-5 max-sm:contents lg:sticky lg:top-24">
                    <p className="hidden text-sm text-ink-muted lg:block">Price range</p>
                    <p className="hidden text-xl font-bold text-ink lg:block" data-numeric>
                      {price}
                    </p>
                    {/* The same controls on every width: a fixed bar on a
                        phone, a row in this card from sm. */}
                    <div className={cn(dockClass, 'flex items-center gap-3 lg:mt-4 lg:flex-col')}>
                      <div className="min-w-0 flex-1 sm:flex-none lg:w-full">{inquireControl}</div>
                      {saveControl}
                    </div>
                    <dl className="mt-5 hidden space-y-3 border-t border-hairline pt-5 text-sm lg:block">
                      <div className="flex items-center gap-2.5">
                        <MapPin className="size-4 shrink-0 text-palayok-500" aria-hidden="true" />
                        <dt className="font-semibold text-ink">Location</dt>
                        <dd className="text-ink-muted">{data.creative.municipality}</dd>
                      </div>
                    </dl>
                  </Card>
                </aside>

                <div className="min-w-0 space-y-10">
                  {/* The person on the left, View profile on the right; on a
                      narrow phone the link drops under them rather than
                      squeezing the name. The rating sits under the name, never
                      beside it, so it can never cut the name short. */}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-hairline py-4">
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-4">
                      <Avatar src={data.creative.avatarUrl} name={creativeName} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words text-ink">{creativeName}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          {data.creative.municipality}
                          {data.creative.isNearby && <Badge tone="accent">Nearby</Badge>}
                        </p>
                        {/*
                          Only when there is one (plan 0038 rule 2): "No ratings
                          yet" under every creative would make unrated the loudest
                          fact about them.
                        */}
                        {data.creative.rating.count > 0 && (
                          <div className="mt-1">
                            <RatingScore summary={data.creative.rating} size="sm" />
                          </div>
                        )}
                      </div>
                    </div>
                    <Link
                      to={profilePath}
                      className="link-underline inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-lawa-700"
                    >
                      View profile
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>

                  {data.description && (
                    <section aria-labelledby="offer-about">
                      <h2 id="offer-about" className="text-xl text-ink">
                        About this offer
                      </h2>
                      <p className="mt-3 max-w-[70ch] text-md whitespace-pre-line text-ink-muted">
                        {data.description}
                      </p>
                    </section>
                  )}

                  {data.images.length > 1 && (
                    <section aria-labelledby="offer-gallery">
                      <h2 id="offer-gallery" className="text-xl text-ink">
                        Gallery
                      </h2>
                      <div className="mt-4">
                        <OfferGalleryGrid
                          images={data.images}
                          offerTitle={data.title}
                          onOpen={lightbox.open}
                        />
                      </div>
                    </section>
                  )}
                </div>
              </div>

              <SimilarOffers offer={data} saving={cardSaving} viewerSlug={user?.profileSlug} />
              {lightbox.lightbox}
            </>
          )}
        </Container>
      </main>
    </>
  );
}

const heroPill =
  'interactive-press inline-flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink shadow-sm';

/**
 * Other offers in the same sub-domain — the offer index's own filter, so this
 * is one more request to an endpoint the directory already uses. Hidden when
 * this is the only one.
 */
function SimilarOffers({
  offer,
  saving,
  viewerSlug,
}: {
  offer: PublishedOfferDetail;
  saving: OfferSaving;
  viewerSlug: string | null | undefined;
}) {
  const similar = usePublishedOffers({ subdomain: offer.subdomain.slug, limit: 5 });
  const rows = (similar.data?.data ?? []).filter((row) => row.id !== offer.id).slice(0, 4);
  if (rows.length === 0) return null;

  return (
    <section className="mt-16 border-t border-hairline pt-10" aria-labelledby="similar-offers">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="similar-offers" className="text-xl text-ink">
          Similar offers
        </h2>
        <Link
          to={`/directory?subdomain=${encodeURIComponent(offer.subdomain.slug)}`}
          className="link-underline inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-lawa-700"
        >
          View all
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <ul className="u-no-scrollbar -mx-(--gutter) mt-5 flex snap-x scroll-px-(--gutter) gap-4 overflow-x-auto px-(--gutter) pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
        {rows.map((row) => (
          <OfferCard
            key={row.id}
            compact
            className="w-64 shrink-0 snap-start lg:w-auto"
            href={`/offers/${row.id}`}
            image={row.image}
            title={row.title}
            description={null}
            eyebrow={row.subdomain.domain}
            price={formatPriceRange(row.priceMinCentavos, row.priceMaxCentavos)}
            provider={{
              name: row.creative.displayName ?? row.creative.slug,
              avatarUrl: row.creative.avatarUrl,
              municipality: row.creative.municipality,
            }}
            save={
              saving.enabled && row.creative.slug !== viewerSlug
                ? {
                    saved: saving.isSaved(row.id),
                    pending: saving.isPending(row.id),
                    onToggle: () => saving.toggle(row.id),
                  }
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

function OfferDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton radius="md" className="aspect-video w-full lg:aspect-21/9" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:gap-x-10">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-6 w-40" />
          <div className="mt-6 flex items-center gap-3 border-y border-hairline py-4">
            <Skeleton radius="full" className="size-12" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <Skeleton radius="md" className="hidden h-56 lg:block" />
      </div>
      <ul className="mt-16 hidden gap-4 lg:grid lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <OfferCardSkeleton key={i} compact />
        ))}
      </ul>
    </div>
  );
}
