import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { transitionTo } from '@/components/page-transition/transition-to';
import { useLogin } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { Button, ButtonLink, Eyebrow, Input } from '@/components/ui';
import { safeReturnPath, withNextParam } from '@/lib/return-path';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeReturnPath(searchParams.get('next'));
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await login.mutateAsync({ username, password });
      void navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  return (
    <AuthShell
      action={
        <ButtonLink
          to={withNextParam('/register', searchParams.get('next'))}
          variant="secondary"
          size="sm"
          onClick={transitionTo('bloom')}
        >
          Register
        </ButtonLink>
      }
      banner={<RegistrationStatusBanner />}
    >
      <Eyebrow>Welcome back</Eyebrow>
      <h1 className="u-serif mt-4 text-4xl text-ink md:text-5xl">Sign in</h1>
      <p className="mt-3 max-w-md text-md text-ink-muted">
        Use the username and password you chose at registration.
      </p>

      <form onSubmit={(event) => void onSubmit(event)} className="mt-10 max-w-md space-y-5" noValidate>
        {error && (
          <p
            className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
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

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={login.isPending}
          iconRight={<ArrowRight className="size-4" aria-hidden="true" />}
        >
          Sign in
        </Button>

        <p className="text-sm text-ink-subtle">
          Forgotten your password? An administrator must reset it — there is no self-service
          reset in this release.
        </p>
      </form>
    </AuthShell>
  );
}
