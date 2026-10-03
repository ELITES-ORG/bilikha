import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { CornerBlob } from '@/components/Decor';
import { SiteHeader } from '@/components/SiteHeader';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  Container,
  Eyebrow,
  Skeleton,
  StatItem,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ContactComposer } from '@/features/conversations/ContactComposer';
import type { OfferImage } from '@/features/offers/api';
import { ProfileNotFoundError, usePublishedProfile } from '@/features/profiles/api';
import { ProfileRatings } from '@/features/ratings/components/ProfileRatings';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';

type LightboxTarget = { url: string; alt: string };

export function CreativeProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const profile = usePublishedProfile(slug);
  const { data: user } = useCurrentUser();
  const [composerOpen, setComposerOpen] = useState(false);
  const [contactOffer, setContactOffer] = useState<{ id: string; title: string } | null>(null);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightbox) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [lightbox]);

  function openLightbox(image: OfferImage, alt: string, button: HTMLButtonElement) {
    triggerRef.current = button;
    setLightbox({ url: image.url, alt });
  }

  function closeLightbox() {
    setLightbox(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function openContact(offer?: { id: string; title: string }) {
    setContactOffer(offer ?? null);
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
    setContactOffer(null);
  }

  if (profile.isError && profile.error instanceof ProfileNotFoundError) {
    return <NotFoundPage />;
  }

  const nextPath = slug ? `/creatives/${slug}` : '/';
  const offers = profile.data?.offers ?? [];
  const initialMessage = contactOffer
    ? `I'm interested in "${contactOffer.title}".`
    : undefined;

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          {profile.isPending && (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {profile.isError && <p className="text-danger-700">{profile.error.message}</p>}

          {profile.data && (
            <>
              <Eyebrow>Creative profile</Eyebrow>

              {/* Banner, then the avatar lifted over its lower edge. */}
              <div className="relative mt-4 h-32 overflow-hidden rounded-lg bg-primary sm:h-40">
                <CornerBlob placement="top-right" onNavy />
                <CornerBlob placement="bottom-left" onNavy className="opacity-70" />
              </div>

              <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16">
                <span className="rounded-full bg-paper p-1 shadow-sm">
                  <Avatar
                    src={profile.data.avatarUrl}
                    name={profile.data.displayName ?? profile.data.fullName}
                    size="xl"
                  />
                </span>
                <h1 className="u-display mt-4 text-3xl text-ink sm:text-4xl">
                  {profile.data.displayName ?? profile.data.fullName}
                </h1>
                <p className="mt-2 flex items-center gap-1.5 text-base text-ink-muted">
                  <MapPin className="size-4 text-palayok-500" aria-hidden />
                  {profile.data.municipality}
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {profile.data.subdomains.map((s) => (
                    <Badge key={s.slug} tone={s.isPrimary ? 'brand' : 'neutral'}>
                      {s.name}
                      {s.isPrimary ? ' · primary' : ''}
                    </Badge>
                  ))}
                </div>

                <div className="mt-8 grid w-full max-w-md grid-cols-3 divide-x divide-hairline rounded-md border border-hairline bg-surface py-4 shadow-xs">
                  <StatItem
                    className="items-center px-2 first:pl-2"
                    value={offers.length}
                    label={offers.length === 1 ? 'Offer' : 'Offers'}
                  />
                  <StatItem
                    className="items-center px-2"
                    value={profile.data.subdomains.length}
                    label={profile.data.subdomains.length === 1 ? 'Craft' : 'Crafts'}
                  />
                  <StatItem
                    className="items-center px-2"
                    value={new Date(profile.data.memberSince).getFullYear()}
                    label="Member since"
                  />
                </div>
              </div>

              {profile.data.bio && (
                <p className="mt-10 text-md text-ink text-pretty whitespace-pre-wrap">
                  {profile.data.bio}
                </p>
              )}

              {/* Above the offers: what other clients found is part of reading
                  the person, not a footnote to their price list. */}
              <ProfileRatings
                slug={profile.data.slug}
                isOwner={user?.profileSlug === profile.data.slug}
              />

              {offers.length > 0 && (
                <section className="mt-10" aria-labelledby="offers-heading">
                  <h2 id="offers-heading" className="u-display text-2xl text-ink">
                    Offers
                  </h2>
                  <ul className="mt-6 space-y-5">
                    {offers.map((offer) => (
                      <Card as="li" key={offer.id} id={`offer-${offer.id}`} className="space-y-4 p-5 sm:p-6">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="u-display text-xl text-ink">{offer.title}</h3>
                          <Badge tone="brand">{offer.subdomain.name}</Badge>
                        </div>
                        <p className="text-md font-bold text-palayok-600" data-numeric>
                          {formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                        </p>
                        {offer.description && (
                          <p className="text-base text-ink text-pretty whitespace-pre-wrap">
                            {offer.description}
                          </p>
                        )}
                        {offer.images.length > 0 && (
                          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {offer.images.map((image) => (
                              <li key={image.id}>
                                <button
                                  type="button"
                                  className="block w-full overflow-hidden rounded-sm"
                                  onClick={(event) =>
                                    openLightbox(image, offer.title, event.currentTarget)
                                  }
                                >
                                  <img
                                    src={image.thumbUrl}
                                    alt={offer.title}
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
                        {!composerOpen && (
                          <div>
                            {user ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openContact({ id: offer.id, title: offer.title })}
                              >
                                Contact about this offer
                              </Button>
                            ) : (
                              <ButtonLink
                                to={`/login?next=${encodeURIComponent(`${nextPath}#offer-${offer.id}`)}`}
                                size="sm"
                                variant="secondary"
                              >
                                Sign in to contact
                              </ButtonLink>
                            )}
                          </div>
                        )}
                      </Card>
                    ))}
                  </ul>
                </section>
              )}

              <div className="u-rule my-12" />

              {!composerOpen && (
                <div>
                  {user ? (
                    <Button size="lg" onClick={() => openContact()}>
                      Contact
                    </Button>
                  ) : (
                    <ButtonLink
                      to={`/login?next=${encodeURIComponent(nextPath)}`}
                      size="lg"
                    >
                      Sign in to contact
                    </ButtonLink>
                  )}
                </div>
              )}

              {user && composerOpen && (
                <ContactComposer
                  key={contactOffer?.id ?? 'profile'}
                  profileSlug={profile.data.slug}
                  creativeName={profile.data.displayName ?? profile.data.fullName}
                  initialMessage={initialMessage}
                  offerId={contactOffer?.id}
                  onCancel={closeComposer}
                />
              )}
            </>
          )}
        </Container>
      </main>

      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] max-w-3xl border-0 bg-transparent p-0 backdrop:bg-scrim/70"
        onClose={closeLightbox}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeLightbox();
        }}
      >
        {lightbox && (
          <img
            src={lightbox.url}
            alt={lightbox.alt}
            className="max-h-[85vh] w-auto max-w-full"
          />
        )}
      </dialog>
    </>
  );
}
