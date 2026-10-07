import { Card, CardBody, Container } from '@/components/ui';
import { PasswordForm } from '@/features/me/PasswordForm';

/**
 * Where an account lands after an administrator reset its password (ADR 0051).
 *
 * `RequireAuth` sends every authenticated route here while
 * `mustChangePassword` is set, and the API refuses everything else anyway — so
 * this screen deliberately has no navigation, no bottom bar and no way onward.
 * There is exactly one thing to do.
 *
 * The form is the ordinary one: the temporary password goes in "Current
 * password", which is what makes it single-use.
 */
export function ForcePasswordChangePage() {
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
            <CardBody>
              <PasswordForm />
            </CardBody>
          </Card>
        </Container>
      </main>
    </div>
  );
}
