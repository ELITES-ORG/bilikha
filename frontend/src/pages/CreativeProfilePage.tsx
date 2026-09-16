import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Avatar, Badge, Button, ButtonLink, Container, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ContactComposer } from '@/features/conversations/ContactComposer';
import { ProfileNotFoundError, usePublishedProfile } from '@/features/profiles/api';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function CreativeProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const profile = usePublishedProfile(slug);
  const { data: user } = useCurrentUser();
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const lightboxItem = profile.data?.portfolio?.find((item) => item.id === lightboxId) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightboxItem) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [lightboxItem]);

  function openLightbox(id: string, button: HTMLButtonElement) {
    triggerRef.current = button;
    setLightboxId(id);
  }

  function closeLightbox() {
    setLightboxId(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  if (profile.isError && profile.error instanceof ProfileNotFoundError) {
    return <NotFoundPage />;
  }

  const nextPath = slug ? `/creatives/${slug}` : '/';

  return (
    <>
      <SiteHeader />
      <RegistrationStatusBanner />

      <main>
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

              {(profile.data.portfolio?.length ?? 0) > 0 && (
                <section className="mt-10" aria-labelledby="portfolio-heading">
                  <h2 id="portfolio-heading" className="u-display text-2xl text-ink">
                    Portfolio
                  </h2>
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {profile.data.portfolio?.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="block w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lawa-700"
                          onClick={(event) => openLightbox(item.id, event.currentTarget)}
                        >
                          <img
                            src={item.thumbUrl}
                            alt={item.caption ?? 'Portfolio image'}
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
                    <Button size="lg" onClick={() => setComposerOpen(true)}>
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
                  profileSlug={profile.data.slug}
                  creativeName={profile.data.displayName ?? profile.data.fullName}
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
            alt={lightboxItem.caption ?? 'Portfolio image'}
            className="max-h-[85vh] w-auto max-w-full"
          />
        )}
      </dialog>
    </>
  );
}
