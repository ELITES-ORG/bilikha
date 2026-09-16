import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { SiteHeader } from '@/components/SiteHeader';
import { Badge, Button, ButtonLink, Container, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { InquiryComposer } from '@/features/inquiries/InquiryComposer';
import { ProfileNotFoundError, usePublishedProfile } from '@/features/profiles/api';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function CreativeProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const profile = usePublishedProfile(slug);
  const { data: user } = useCurrentUser();
  const [composerOpen, setComposerOpen] = useState(false);

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
              <h1 className="u-display mt-3 text-4xl text-ink">
                {profile.data.displayName ?? profile.data.fullName}
              </h1>
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
                <InquiryComposer
                  profileSlug={profile.data.slug}
                  creativeName={profile.data.displayName ?? profile.data.fullName}
                  onCancel={() => setComposerOpen(false)}
                />
              )}
            </>
          )}
        </Container>
      </main>
    </>
  );
}
