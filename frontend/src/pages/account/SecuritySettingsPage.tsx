import { SiteHeader } from '@/components/SiteHeader';
import { Button, Card, CardBody, Container } from '@/components/ui';
import { useLogout } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { PasswordForm } from '@/features/me/PasswordForm';
import { pbBottomNav } from '@/lib/bottom-nav';
import { AccountPageHeading } from './AccountPageHeading';

export function SecuritySettingsPage() {
  const logout = useLogout();

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <RegistrationStatusBanner />

      <main className={pbBottomNav}>
        <Container width="narrow" className="py-(--section-gap)">
          <AccountPageHeading title="Security" />
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            Change your password, or end this session on this device.
          </p>

          <Card elevation="flat" className="mt-10">
            <CardBody className="space-y-8">
              <section className="space-y-4" aria-labelledby="password-heading">
                <h2 id="password-heading" className="text-lg font-medium text-ink">
                  Password
                </h2>
                <PasswordForm />
              </section>

              <section
                className="space-y-3 border-t border-hairline pt-6"
                aria-labelledby="sign-out-heading"
              >
                <h2 id="sign-out-heading" className="text-lg font-medium text-ink">
                  Sign out
                </h2>
                <p className="text-sm text-ink-muted">
                  Ends this session on this device only.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={logout.isPending}
                  onClick={() => void logout.mutateAsync()}
                >
                  Sign out
                </Button>
              </section>
            </CardBody>
          </Card>
        </Container>
      </main>
    </div>
  );
}
