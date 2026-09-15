import { TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ProfileEditor } from '@/features/me/ProfileEditor';
import { useOwnProfile } from '@/features/me/api';

export function AccountPage() {
  const profile = useOwnProfile();

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Account</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Your account</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Keep your public details and sign-in security up to date.
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

          {profile.isSuccess && profile.data && (
            <section className="mt-10" aria-labelledby="profile-section-heading">
              <h2 id="profile-section-heading" className="u-display text-2xl text-ink">
                Profile
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                These details shape how people find and understand your work.
              </p>
              <Card elevation="flat" className="mt-5">
                <CardBody>
                  <ProfileEditor profile={profile.data} />
                </CardBody>
              </Card>
            </section>
          )}

          {profile.isSuccess && (
            <section className="mt-12" aria-labelledby="security-section-heading">
              <h2 id="security-section-heading" className="u-display text-2xl text-ink">
                Security
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Password settings for this account.
              </p>
              <Card elevation="flat" className="mt-5">
                <CardBody>
                  <p className="text-sm text-ink-muted">
                    Use a long password that you do not use on another service.
                  </p>
                </CardBody>
              </Card>
            </section>
          )}
        </Container>
      </main>
    </div>
  );
}
