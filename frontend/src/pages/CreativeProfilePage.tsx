import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CornerBlob } from '@/components/Decor';
import { BackPill, ShareButton } from '@/components/PageCornerActions';
import { ProfileSkeleton } from '@/components/page-skeleton/parts';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  Skeleton,
  StatItem,
  TabPanels,
  Tabs,
} from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ContactComposer } from '@/features/conversations/ContactComposer';
import type { OfferImage } from '@/features/offers/api';
import { OfferCard } from '@/features/offers/OfferCard';
import { ProfileNotFoundError, usePublishedProfile } from '@/features/profiles/api';
import type { PublicProfile } from '@contracts/profiles';
import { useRatingSummary } from '@/features/ratings/api';
import { ProfileRatings } from '@/features/ratings/components/ProfileRatings';
import { RatingScore } from '@/features/ratings/components/RatingScore';
import { formatPriceRange } from '@/lib/money';
import { pbBottomNav } from '@/lib/bottom-nav';
import { NotFoundPage } from '@/pages/NotFoundPage';

type LightboxTarget = { url: string; alt: string };

const TABS = ['services', 'portfolio', 'reviews', 'about'] as const;
type ProfileTab = (typeof TABS)[number];
const TAB_LABEL: Record<ProfileTab, string> = {
  services: 'Services',
  portfolio: 'Portfolio',
  reviews: 'Reviews',
  about: 'About',
};

function parseTab(raw: string | null): ProfileTab {
  return TABS.includes(raw as ProfileTab) ? (raw as ProfileTab) : 'services';
}

function joinedLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

/** Sub-domains grouped under their domain, primary craft first. */
function craftsByDomain(profile: PublicProfile) {
  const sorted = [...profile.subdomains].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const groups = new Map<string, string[]>();
  for (const s of sorted) groups.set(s.domain, [...(groups.get(s.domain) ?? []), s.name]);
  return { sorted, groups };
}

export function CreativeProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const profile = usePublishedProfile(slug);
  const rating = useRatingSummary(slug);
  const { data: user } = useCurrentUser();
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const tab = parseTab(params.get('tab'));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightbox) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [lightbox]);

  // The composer opens under the header, which may be off screen when the
  // sidebar's "Message now" was the button pressed.
  useEffect(() => {
    if (composerOpen) composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [composerOpen]);

  function openLightbox(image: OfferImage, alt: string, button: HTMLButtonElement) {
    triggerRef.current = button;
    setLightbox({ url: image.url, alt });
  }

  function closeLightbox() {
    setLightbox(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function openContact() {
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
  }

  function setTab(next: ProfileTab) {
    const merged = new URLSearchParams(params);
    if (next === 'services') merged.delete('tab');
    else merged.set('tab', next);
    // Replace, not push: switching sections is not a page the Back button
    // should have to walk through.
    setParams(merged, { replace: true });
  }

  if (profile.isError && profile.error instanceof ProfileNotFoundError) {
    return <NotFoundPage />;
  }

  const nextPath = slug ? `/creatives/${slug}` : '/';
  const data = profile.data;
  const isOwner = Boolean(data && user?.profileSlug === data.slug);

  return (
    <>
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="wide" className="py-6 sm:py-10">
          {profile.isPending && <ProfileSkeleton />}

          {profile.isError && <p className="text-danger-700">{profile.error.message}</p>}

          {data && (() => {
            const name = data.displayName ?? data.fullName;
            const firstName = name.split(/\s+/)[0] ?? name;
            const offers = data.offers ?? [];
            const { sorted, groups } = craftsByDomain(data);
            const portfolio = offers.flatMap((offer) =>
              offer.images.map((image, index) => ({ image, offer, index })),
            );

            const messageControl = user ? (
              <Button
                size="lg"
                fullWidth
                className="sm:w-auto"
                iconLeft={<MessageSquare className="size-4" aria-hidden="true" />}
                onClick={openContact}
              >
                Message
              </Button>
            ) : (
              <ButtonLink
                to={`/login?next=${encodeURIComponent(nextPath)}`}
                size="lg"
                fullWidth
                className="sm:w-auto"
                iconLeft={<MessageSquare className="size-4" aria-hidden="true" />}
              >
                Sign in to message
              </ButtonLink>
            );

            return (
              <>
                {/* Cover. There is no cover photo in the data, so a navy band
                    carries the identity instead of a stock image. */}
                <div className="relative h-32 overflow-hidden rounded-lg bg-primary sm:h-44 lg:h-56 short:h-24">
                  <CornerBlob placement="top-right" onNavy />
                  <CornerBlob placement="bottom-left" onNavy className="opacity-70" />
                  <div className="absolute top-3 left-3">
                    <BackPill />
                  </div>
                  <div className="absolute top-3 right-3">
                    <ShareButton title={name} label="Share this profile" />
                  </div>
                </div>

                {/* Identity: centred on a phone, left-aligned with actions on
                    the right from lg. */}
                {/* Only the avatar overlaps the cover; from lg the name and
                    actions start below the cover's edge (pt-18 = the overlap). */}
                <div className="relative -mt-14 flex flex-col items-center text-center sm:-mt-16 lg:flex-row lg:items-start lg:justify-between lg:px-8 lg:text-left">
                  <div className="flex flex-col items-center lg:flex-row lg:items-start lg:gap-6">
                    <span className="rounded-full bg-paper p-1 shadow-sm">
                      <Avatar src={data.avatarUrl} name={name} size="xl" />
                    </span>
                    <div className="mt-4 lg:mt-0 lg:pt-18">
                      <h1 className="u-display text-3xl break-words text-ink sm:text-4xl">{name}</h1>
                      <p className="mt-1 text-sm text-ink-muted">@{data.slug}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:mt-0 lg:pt-18">
                    {isOwner ? (
                      <>
                        <ButtonLink
                          to="/account/profile"
                          variant="secondary"
                          size="lg"
                          iconLeft={<Pencil className="size-4" aria-hidden="true" />}
                        >
                          Edit profile
                        </ButtonLink>
                        <ButtonLink
                          to="/account/offers"
                          size="lg"
                          iconLeft={<Plus className="size-4" aria-hidden="true" />}
                        >
                          Add offer
                        </ButtonLink>
                      </>
                    ) : (
                      !composerOpen && messageControl
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-col items-center text-center lg:items-start lg:px-8 lg:text-left">
                  {sorted.length > 0 && (
                    <p className="font-semibold text-ink">
                      {sorted.map((s) => s.name).join(' · ')}
                    </p>
                  )}
                  <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink-muted lg:justify-start">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4 text-palayok-500" aria-hidden="true" />
                      {data.municipality}, Biliran
                      {data.isNearby && <Badge tone="accent">Nearby</Badge>}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      Joined {joinedLabel(data.memberSince)}
                    </span>
                  </p>
                  {data.bio && (
                    <p className="mt-4 max-w-prose text-md whitespace-pre-line text-ink-muted">
                      {data.bio}
                    </p>
                  )}
                </div>

                {user && composerOpen && !isOwner && (
                  <div ref={composerRef} className="mt-8 lg:px-8">
                    <ContactComposer
                      key="profile"
                      profileSlug={data.slug}
                      creativeName={name}
                      onCancel={closeComposer}
                    />
                  </div>
                )}

                <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)]">
                  <div className="min-w-0">
                    <Tabs
                      variant="underline"
                      label="Profile sections"
                      idPrefix="profile"
                      value={tab}
                      onChange={setTab}
                      items={TABS.map((value) => ({ value, label: TAB_LABEL[value] }))}
                    />

                    <TabPanels idPrefix="profile" values={TABS} value={tab} className="pt-8">
                      {tab === 'services' && (
                        <>
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <h2 className="text-2xl text-ink">Services</h2>
                            {isOwner && (
                              <ButtonLink
                                to="/account/offers"
                                size="sm"
                                variant="secondary"
                                iconLeft={<Plus className="size-4" aria-hidden="true" />}
                              >
                                Add offer
                              </ButtonLink>
                            )}
                          </div>
                          {offers.length > 0 ? (
                            <ul className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                              {offers.map((offer) => (
                                <OfferCard
                                  key={offer.id}
                                  href={`/offers/${offer.id}`}
                                  image={offer.images[0] ?? null}
                                  title={offer.title}
                                  description={offer.description}
                                  eyebrow={offer.subdomain.domain}
                                  category={offer.subdomain.name}
                                  price={formatPriceRange(offer.priceMinCentavos, offer.priceMaxCentavos)}
                                  fallbackName={name}
                                />
                              ))}
                            </ul>
                          ) : (
                            <EmptyState
                              className="mt-6 py-8"
                              title="No services yet"
                              description={`${firstName} hasn't added any services.`}
                            />
                          )}
                        </>
                      )}

                      {tab === 'portfolio' && (
                        <>
                          <h2 className="text-2xl text-ink">Portfolio</h2>
                          {portfolio.length > 0 ? (
                            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                              {portfolio.map(({ image, offer, index }) => (
                                <li key={image.id}>
                                  <button
                                    type="button"
                                    aria-label={`Open ${offer.title}, image ${index + 1}`}
                                    className="group block w-full overflow-hidden rounded-lg bg-primary-soft"
                                    onClick={(event) =>
                                      openLightbox(image, `${offer.title}, image ${index + 1}`, event.currentTarget)
                                    }
                                  >
                                    <img
                                      src={image.thumbUrl}
                                      alt={`${offer.title}, image ${index + 1}`}
                                      width={400}
                                      height={300}
                                      loading="lazy"
                                      decoding="async"
                                      className="aspect-4/3 w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-103"
                                    />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <EmptyState
                              className="mt-6 py-8"
                              icon={<LayoutGrid className="size-5" />}
                              title="No portfolio items yet"
                              description="Images added to offers appear here."
                            />
                          )}
                        </>
                      )}

                      {tab === 'reviews' && (
                        <ProfileRatings slug={data.slug} isOwner={isOwner} />
                      )}

                      {tab === 'about' && (
                        <div className="space-y-8">
                          {data.bio && (
                            <AboutBlock title="About">
                              <p className="max-w-prose text-md whitespace-pre-line text-ink-muted">
                                {data.bio}
                              </p>
                            </AboutBlock>
                          )}
                          <AboutBlock title="Location">
                            <p className="text-md text-ink-muted">{data.municipality}, Biliran</p>
                          </AboutBlock>
                          {groups.size > 0 && (
                            <AboutBlock title="Creative domains">
                              <dl className="space-y-3">
                                {[...groups].map(([domain, crafts]) => (
                                  <div key={domain}>
                                    <dt className="font-semibold text-ink">{domain}</dt>
                                    <dd className="text-ink-muted">{crafts.join(' · ')}</dd>
                                  </div>
                                ))}
                              </dl>
                            </AboutBlock>
                          )}
                          <AboutBlock title="Member since">
                            <p className="text-md text-ink-muted">{joinedLabel(data.memberSince)}</p>
                          </AboutBlock>
                        </div>
                      )}
                    </TabPanels>
                  </div>

                  {/* The sidebar from lg; below the content, as ordinary
                      sections, on smaller screens. */}
                  <aside aria-label={`About ${firstName}`} className="min-w-0">
                    <Card className="divide-y divide-hairline lg:sticky lg:top-24">
                      <dl className="grid grid-cols-3 divide-x divide-hairline px-2 py-5">
                        <StatItem className="items-center px-2 first:pl-2" value={offers.length} label={offers.length === 1 ? 'Offer' : 'Offers'} />
                        <StatItem className="items-center px-2" value={data.subdomains.length} label={data.subdomains.length === 1 ? 'Craft' : 'Crafts'} />
                        <StatItem className="items-center px-2" value={new Date(data.memberSince).getFullYear()} label="Joined" />
                      </dl>

                      <SidebarBlock title="Quick info">
                        <ul className="space-y-3 text-sm">
                          <li className="flex items-start gap-3">
                            <LayoutGrid className="mt-0.5 size-4 shrink-0 text-lawa-700" aria-hidden="true" />
                            <span>
                              <span className="block font-semibold text-ink">
                                {groups.size === 1 ? 'Creative domain' : 'Creative domains'}
                              </span>
                              <span className="text-ink-muted">{[...groups.keys()].join(', ')}</span>
                            </span>
                          </li>
                          <li className="flex items-start gap-3">
                            <MapPin className="mt-0.5 size-4 shrink-0 text-lawa-700" aria-hidden="true" />
                            <span>
                              <span className="block font-semibold text-ink">Location</span>
                              <span className="text-ink-muted">{data.municipality}, Biliran</span>
                            </span>
                          </li>
                        </ul>
                      </SidebarBlock>

                      {sorted.length > 0 && (
                        <SidebarBlock title="Specialties">
                          <ul className="flex flex-wrap gap-2">
                            {sorted.map((s) => (
                              <li key={s.slug}>
                                <Badge tone={s.isPrimary ? 'brand' : 'neutral'}>{s.name}</Badge>
                              </li>
                            ))}
                          </ul>
                        </SidebarBlock>
                      )}

                      <SidebarBlock title="Ratings">
                        {rating.isPending && <Skeleton className="h-6 w-40" />}
                        {rating.data && (
                          <RatingScore
                            summary={rating.data}
                            emptyText="No ratings yet."
                            size="sm"
                          />
                        )}
                        {tab !== 'reviews' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            fullWidth
                            className="mt-4"
                            onClick={() => setTab('reviews')}
                          >
                            View all reviews
                          </Button>
                        )}
                      </SidebarBlock>

                      {!isOwner && (
                        <div className="bg-primary-soft p-5">
                          <p className="font-semibold text-ink">
                            Interested in working with {firstName}?
                          </p>
                          <p className="mt-1 text-sm text-ink-muted">
                            Send a message to talk through your project.
                          </p>
                          <div className="mt-4">
                            {user ? (
                              <Button
                                fullWidth
                                iconLeft={<MessageSquare className="size-4" aria-hidden="true" />}
                                onClick={openContact}
                              >
                                Message now
                              </Button>
                            ) : (
                              <ButtonLink
                                to={`/login?next=${encodeURIComponent(nextPath)}`}
                                fullWidth
                              >
                                Sign in to message
                              </ButtonLink>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  </aside>
                </div>
              </>
            );
          })()}
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

function AboutBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl text-ink">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SidebarBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="p-5">
      <h2 className="text-md font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
