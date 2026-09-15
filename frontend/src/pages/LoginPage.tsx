import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { Button, ButtonLink, Container, Input } from '@/components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({ username, password });
      // Always land on home so the registration status banner is visible.
      void navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center justify-between">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
          <ButtonLink to="/register" variant="ghost" size="sm">
            Register
          </ButtonLink>
        </Container>
      </header>
      <RegistrationStatusBanner />

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">Welcome back</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">Sign in</h1>
          <p className="mt-3 text-md text-ink-muted">
            Use the username and password you chose at registration.
          </p>

          <form onSubmit={(event) => void onSubmit(event)} className="mt-10 max-w-md space-y-5" noValidate>
            {error && (
              <p
                className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                role="alert"
              >
                {error}
              </p>
            )}

            <Input
              label="Username"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button type="submit" size="lg" loading={login.isPending}>
              Sign in
            </Button>

            <p className="text-sm text-ink-subtle">
              Forgotten your password? An administrator must reset it — there is no self-service
              reset in this release.
            </p>
          </form>
        </Container>
      </main>
    </div>
  );
}
