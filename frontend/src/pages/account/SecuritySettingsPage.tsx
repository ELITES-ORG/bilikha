import { SiteHeader } from '@/components/SiteHeader';
import { Button, Card, CardBody, Container } from '@/components/ui';
import { useLogout } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { PasswordForm } from '@/features/me/PasswordForm';
import { pbBottomNav } from '@/lib/bottom-nav';
import { AccountBackLink } from './AccountBackLink';

export function SecuritySettingsPage() {
  const logout = useLogout();

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <AccountBackLink />
          <h1 className="u-display mt-8 text-3xl text-ink md:text-4xl">Security</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Password settings for this account.
          </p>

          <Card elevation="flat" className="mt-10">
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
        </Container>
      </main>
    </div>
  );
}
