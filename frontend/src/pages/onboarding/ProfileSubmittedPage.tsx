import { Link } from 'react-router-dom';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { ButtonLink, Container } from '@/components/ui';

export function ProfileSubmittedPage() {
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
          <p className="u-eyebrow">Submitted</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
            Your profile is being reviewed
          </h1>
          <p className="mt-4 max-w-xl text-md text-ink-muted">
            It will appear in the directory once an administrator publishes it.
            The status banner above stays with you until then.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/directory">Browse the directory</ButtonLink>
            <ButtonLink to="/account" variant="secondary">
              Go to your account
            </ButtonLink>
          </div>
        </Container>
      </main>
    </div>
  );
}
