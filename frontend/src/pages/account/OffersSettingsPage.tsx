import { Navigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { Container, EmptyState } from '@/components/ui';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { useOwnProfile } from '@/features/me/api';
import { OfferCardSkeleton, offerGridClass } from '@/features/offers/OfferCard';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { cn } from '@/lib/cn';
import { pbBottomNav } from '@/lib/bottom-nav';
import { AccountPageHeading } from './AccountPageHeading';

export function OffersSettingsPage() {
  const profile = useOwnProfile();

  if (profile.isPending) {
    return (
      <div className="bg-paper">
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="wide" className="py-(--section-gap)">
            <AccountPageHeading title="Offers" />
            <ul className={cn('mt-10', offerGridClass)} aria-label="Loading offers">
              {Array.from({ length: 3 }).map((_, i) => (
                <OfferCardSkeleton key={i} />
              ))}
            </ul>
          </Container>
        </main>
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="bg-paper">
        <RegistrationStatusBanner />
        <main className={pbBottomNav}>
          <Container width="wide" className="py-(--section-gap)">
            <AccountPageHeading title="Offers" />
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
    <div className="bg-paper">
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="wide" className="py-(--section-gap)">
          <AccountPageHeading title="Offers" />
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            What you are available to be hired for. These are what clients browse.
          </p>

          <div className="mt-10">
            <OfferEditor />
          </div>
        </Container>
      </main>
    </div>
  );
}
