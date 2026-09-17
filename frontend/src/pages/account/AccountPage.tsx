import { TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { ModeSwitch } from '@/components/ModeSwitch';
import { Button, ButtonLink, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { useCurrentUser, useLogout } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { AvatarUploader } from '@/features/media/AvatarUploader';
import { ProfileEditor } from '@/features/me/ProfileEditor';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { PasswordForm } from '@/features/me/PasswordForm';
import { useOwnProfile } from '@/features/me/api';
import { pbBottomNav } from '@/lib/bottom-nav';

export function AccountPage() {
  const profile = useOwnProfile();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const hasProfile = Boolean(user?.profileSlug);

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Account</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Your account</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Keep your public details and sign-in security up to date.
          </p>

          {hasProfile && (
            <section className="mt-8" aria-labelledby="view-mode-heading">
              <h2 id="view-mode-heading" className="u-display text-2xl text-ink">
                How you use Bilikha
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                Choose whether Home, Messages and History show people you can hire, or work you can take on.
              </p>
              <div className="mt-4">
                <ModeSwitch size="md" />
              </div>
            </section>
          )}

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

          {profile.isSuccess && profile.data && (
            <section className="mt-12" aria-labelledby="offers-section-heading">
              <h2 id="offers-section-heading" className="u-display text-2xl text-ink">
                Offers
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                What you are available to be hired for. These are what clients browse.
              </p>
              <Card elevation="flat" className="mt-5">
                <CardBody>
                  <OfferEditor />
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
                <CardBody className="space-y-6">
                  <PasswordForm />

                  <div className="border-t border-hairline pt-6">
                    <p className="text-sm font-medium text-ink">Sign out</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Ends this session on this device only.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      loading={logout.isPending}
                      onClick={() => void logout.mutateAsync()}
                    >
                      Sign out
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </section>
          )}
        </Container>
      </main>
    </div>
  );
}
