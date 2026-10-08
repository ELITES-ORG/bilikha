import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import {
  playTransition,
  SESSION_LABEL,
  submitOrigin,
  transitionTo,
} from '@/components/page-transition/transition-to';
import { useLogin } from '@/features/auth/api';
import { RegistrationStatusBanner } from '@/features/auth/RegistrationStatusBanner';
import { Button, ButtonLink, Eyebrow, Input } from '@/components/ui';
import { safeReturnPath, withNextParam } from '@/lib/return-path';
import { useI18n } from '@/i18n/i18n-context';

export function LoginPage() {
  const { message } = useI18n();
  const copy = {
    eyebrow: message('signIn.eyebrow'),
    heading: message('signIn.heading'),
    intro: message('signIn.intro'),
    username: message('signIn.username'),
    password: message('signIn.password'),
    submit: message('signIn.submit'),
    register: message('signIn.register'),
    noSelfService: message('signIn.noSelfService'),
  };
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
    const origin = submitOrigin(event);

    try {
      await login.mutateAsync({ username, password });
      const shown = playTransition('bloom', next, { label: SESSION_LABEL, origin, replace: true });
      if (!shown) void navigate(next, { replace: true });
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
          <span lang={copy.register.lang}>{copy.register.text}</span>
        </ButtonLink>
      }
      banner={<RegistrationStatusBanner />}
    >
      <Eyebrow>
        <span lang={copy.eyebrow.lang}>{copy.eyebrow.text}</span>
      </Eyebrow>
      <h1 lang={copy.heading.lang} className="u-serif mt-4 text-4xl text-ink md:text-5xl">
        {copy.heading.text}
      </h1>
      <p lang={copy.intro.lang} className="mt-3 max-w-md text-md text-ink-muted">
        {copy.intro.text}
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
          label={<span lang={copy.username.lang}>{copy.username.text}</span>}
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label={<span lang={copy.password.lang}>{copy.password.text}</span>}
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
          <span lang={copy.submit.lang}>{copy.submit.text}</span>
        </Button>

        <p lang={copy.noSelfService.lang} className="text-sm text-ink-subtle">
          {copy.noSelfService.text}
        </p>
      </form>
    </AuthShell>
  );
}
