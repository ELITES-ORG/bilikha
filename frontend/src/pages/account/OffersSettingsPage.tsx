import { Navigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useOwnProfile } from '@/features/me/api';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { pbBottomNav } from '@/lib/bottom-nav';
import { AccountBackLink } from './AccountBackLink';

export function OffersSettingsPage() {
  const profile = useOwnProfile();

  if (profile.isPending) {
    return (
      <div className="min-h-dvh bg-paper">
        <SiteHeader />
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="narrow" className="py-(--section-gap)">
            <AccountBackLink />
            <div className="mt-10 space-y-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-56 w-full" />
            </div>
          </Container>
        </main>
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="min-h-dvh bg-paper">
        <SiteHeader />
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="narrow" className="py-(--section-gap)">
            <AccountBackLink />
            <div className="mt-10">
              <EmptyState
                icon={<TriangleAlert className="size-5" />}
                title="Could not load your profile"
                description={profile.error.message}
              />
            </div>
          </Container>
        </main>
      </div>
    );
  }

  if (!profile.data) {
    return <Navigate to="/account" replace />;
  }

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <AccountBackLink />
          <p className="u-eyebrow mt-6">Account</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Offers</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            What you are available to be hired for. These are what clients browse.
          </p>

          <Card elevation="flat" className="mt-10">
            <CardBody>
              <OfferEditor />
            </CardBody>
          </Card>
        </Container>
      </main>
    </div>
  );
}
