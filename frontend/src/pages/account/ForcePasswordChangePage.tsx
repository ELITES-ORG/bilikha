import { Button, Card, CardBody, Container } from '@/components/ui';
import { useLogout } from '@/features/auth/api';
import { PasswordForm } from '@/features/me/PasswordForm';

/**
 * Where an account lands after an administrator reset its password (ADR 0051).
 *
 * `RequireAuth` sends every authenticated route here while
 * `mustChangePassword` is set, and the API refuses everything else anyway — so
 * this screen deliberately has no navigation and no bottom bar. There is
 * exactly one thing to do.
 *
 * Except sign out, which is here because without it the screen is a trap:
 * somebody who mislaid the temporary password their administrator read to them
 * could not even get back to the sign-in page to try another account, and
 * clearing cookies is not a thing to ask of someone on a phone in Naval.
 *
 * The form is the ordinary one: the temporary password goes in "Current
 * password", which is what makes it single-use.
 */
export function ForcePasswordChangePage() {
  const logout = useLogout();

  return (
    <div className="min-h-page bg-paper">
      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <h1 className="u-display text-3xl text-ink md:text-4xl">Set a new password</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            An administrator reset your password, so the one you had no longer works and you
            have been signed out on your other devices. Enter the temporary password they gave
            you, then choose your own.
          </p>
          <p className="mt-3 max-w-xl text-base text-ink-muted">
            Nothing else is available until you do — this is the only screen you can reach.
          </p>

          <Card elevation="flat" className="mt-10">
            <CardBody className="space-y-8">
              <PasswordForm />

              <div className="space-y-3 border-t border-hairline pt-6">
                <p className="text-sm text-ink-muted">
                  Lost the temporary password? Ask the administrator to reset it again — they
                  cannot look up the old one.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={logout.isPending}
                  onClick={() => logout.mutate()}
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
