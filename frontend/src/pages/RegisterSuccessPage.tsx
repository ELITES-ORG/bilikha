import { Link } from 'react-router-dom';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ButtonLink, Container } from '@/components/ui';

export function RegisterSuccessPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
        </Container>
      </header>
      <RegistrationStatusBanner />

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Account created</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">You are signed in</h1>
          <p className="mt-4 max-w-xl text-md text-ink-muted">
            Your creative profile is awaiting review. It will appear in the directory once an
            administrator publishes it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/">Back to home</ButtonLink>
            <ButtonLink to="/directory" variant="secondary">
              Browse the directory
            </ButtonLink>
          </div>
        </Container>
      </main>
    </div>
  );
}
