import { TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ButtonLink, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { AvatarUploader } from '@/features/media/AvatarUploader';
import { ProfileEditor } from '@/features/me/ProfileEditor';
import { useOwnProfile } from '@/features/me/api';
import { pbBottomNav } from '@/lib/bottom-nav';
import { AccountPageHeading } from './AccountPageHeading';

export function ProfileSettingsPage() {
  const profile = useOwnProfile();
  const { data: user } = useCurrentUser();

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <AccountPageHeading title="Profile" />
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            These details shape how people find and understand your work.
          </p>

          {profile.isPending && (
            <div className="mt-10 space-y-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-56 w-full" />
            </div>
          )}

          {profile.isError && (
            <div className="mt-10">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load your profile"
                description={profile.error.message}
              />
            </div>
          )}

          {profile.isSuccess && !profile.data && user && (
            <section className="mt-10" aria-labelledby="photo-section-heading">
              <h2 id="photo-section-heading" className="u-display text-2xl text-ink">
                Photo
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Shown on your account and in conversations.
              </p>
              <Card elevation="flat" className="mt-5">
                <CardBody>
                  <AvatarUploader
                    name={`${user.firstName} ${user.lastName}`}
                    avatarUrl={user.avatarUrl}
                  />
                </CardBody>
              </Card>
            </section>
          )}

          {profile.isSuccess && !profile.data && (
            <section className="mt-10" aria-labelledby="offer-work-heading">
              <h2 id="offer-work-heading" className="u-display text-2xl text-ink">
                Offer your creative work
              </h2>
              <p className="mt-2 max-w-xl text-sm text-ink-muted">
                Add a creative profile to appear in the directory. It is reviewed
                before it goes public — the same path as signing up to offer work.
              </p>
              <ButtonLink to="/welcome/profile?from=account" className="mt-5">
                Set up your profile
              </ButtonLink>
            </section>
          )}

          {profile.isSuccess && profile.data && (
            <Card elevation="flat" className="mt-10">
              <CardBody>
                <ProfileEditor profile={profile.data} />
              </CardBody>
            </Card>
          )}
        </Container>
      </main>
    </div>
  );
}
