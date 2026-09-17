import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton } from '@/components/ui';
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
              <p className="u-eyebrow">Creative profile</p>
              <div className="mt-3 flex items-start gap-4">
                <Avatar
                  src={profile.data.avatarUrl}
                  name={profile.data.displayName ?? profile.data.fullName}
                  size="lg"
                />
                <h1 className="u-display text-4xl text-ink">
                  {profile.data.displayName ?? profile.data.fullName}
                </h1>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-base text-ink-muted">
                <MapPin className="size-4" aria-hidden />
                {profile.data.municipality}
              </p>

              <div className="mt-6 flex flex-wrap gap-1.5">
                {profile.data.subdomains.map((s) => (
                  <Badge key={s.slug} tone={s.isPrimary ? 'brand' : 'neutral'}>
                    {s.name}
                    {s.isPrimary ? ' · primary' : ''}
                  </Badge>
                ))}
              </div>

              {profile.data.bio && (
                <p className="mt-8 text-md text-ink text-pretty whitespace-pre-wrap">
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
                  <ul className="mt-6 space-y-10">
                    {offers.map((offer) => (
                      <li key={offer.id} id={`offer-${offer.id}`} className="space-y-4">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="u-display text-xl text-ink">{offer.title}</h3>
                          <Badge tone="brand">{offer.subdomain.name}</Badge>
                        </div>
                        <p className="text-sm font-medium text-ink">
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
                                  className="block w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700"
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
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="mt-6 text-sm text-ink-subtle">
                Member since{' '}
                {new Date(profile.data.memberSince).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                })}
              </p>

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
        className="m-auto max-h-[90vh] max-w-3xl border-0 bg-transparent p-0 backdrop:bg-ink/70"
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
