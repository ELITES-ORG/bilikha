import { useEffect, useState, type FormEvent } from 'react';
import type { IdDeclinedDetails } from '@contracts/verification';
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
import { ApiError } from '@/lib/api-client';
import { useI18n } from '@/i18n/i18n-context';
import {
  clearDeclineNotice,
  ID_STEP_PATH,
  needsIdStep,
  readDeclineNotice,
} from '@/features/verification/status';

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
    declined: {
      retry: message('signIn.declined.retry'),
      final: message('signIn.declined.final'),
      appealed: message('signIn.declined.appealed'),
    },
    reasonLabel: message('verification.reasonLabel'),
  };
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = safeReturnPath(searchParams.get('next'));
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Why the last session ended, or why signing in is refused (ADR 0057).
  const [declined, setDeclined] = useState<IdDeclinedDetails | null>(readDeclineNotice);

  useEffect(() => {
    clearDeclineNotice();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDeclined(null);
    const origin = submitOrigin(event);

    try {
      const user = await login.mutateAsync({ username, password });
      // An ID still owed comes before anywhere else (ADR 0057).
      const destination = needsIdStep(user) ? ID_STEP_PATH : next;
      const shown = playTransition('bloom', destination, { label: SESSION_LABEL, origin, replace: true });
      if (!shown) void navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ID_DECLINED' && err.details) {
        setDeclined(err.details as IdDeclinedDetails);
        return;
      }
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
        {declined && (
          <div
            className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            role="alert"
          >
            <p lang={copy.declined[declined.kind].lang}>{copy.declined[declined.kind].text}</p>
            {declined.reason && (
              <p className="mt-1">
                <span lang={copy.reasonLabel.lang}>{copy.reasonLabel.text}</span> {declined.reason}
              </p>
            )}
          </div>
        )}

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
