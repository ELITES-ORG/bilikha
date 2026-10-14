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
import { Button, ButtonLink, Eyebrow, Input, Textarea } from '@/components/ui';
import { safeReturnPath, withNextParam } from '@/lib/return-path';
import { ApiError } from '@/lib/api-client';
import { useI18n } from '@/i18n/i18n-context';
import { useIdAppeal } from '@/features/verification/api';
import {
  APPEAL_MAX,
  appealFormProblem,
  appealOpenUntil,
  clearDeclineNotice,
  idStepPathFor,
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
    appeal: {
      until: message('signIn.appeal.until'),
      open: message('signIn.appeal.open'),
      messageLabel: message('signIn.appeal.messageLabel'),
      messageHint: message('signIn.appeal.messageHint'),
      credentials: message('signIn.appeal.credentials'),
      needsCredentials: message('signIn.appeal.needsCredentials'),
      tooShort: message('signIn.appeal.tooShort'),
      submit: message('signIn.appeal.submit'),
      cancel: message('signIn.appeal.cancel'),
      sent: message('signIn.appeal.sent'),
    },
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
  // The one appeal against a *not from Biliran* decline (plan 0053 Step 4.2).
  const appeal = useIdAppeal();
  const [appealing, setAppealing] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSent, setAppealSent] = useState(false);
  const appealUntil = appealOpenUntil(declined);

  useEffect(() => {
    clearDeclineNotice();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDeclined(null);
    setAppealing(false);
    setAppealSent(false);
    const origin = submitOrigin(event);

    try {
      const user = await login.mutateAsync({ username, password });
      // An ID still owed comes before anywhere else (ADR 0057).
      const destination = needsIdStep(user) ? idStepPathFor(next) : next;
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

  async function sendAppeal() {
    const problem = appealFormProblem({ username, password, message: appealMessage });
    if (problem) {
      setAppealError(copy.appeal[problem].text);
      return;
    }
    setAppealError(null);
    try {
      await appeal.mutateAsync({ username, password, message: appealMessage.trim() });
      setAppealSent(true);
      setAppealing(false);
      setAppealMessage('');
      setDeclined((current) => (current ? { kind: 'appealed', reason: current.reason } : current));
    } catch (err) {
      // Closed since the page loaded: say why, and stop offering it.
      if (err instanceof ApiError && err.code === 'ID_APPEAL_CLOSED') {
        setDeclined((current) => (current ? { kind: current.kind, reason: current.reason } : current));
        setAppealing(false);
      }
      setAppealError(err instanceof Error ? err.message : 'Could not send the appeal');
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
            {appealUntil && (
              <p className="mt-2">
                <span lang={copy.appeal.until.lang}>{copy.appeal.until.text}</span>{' '}
                <time dateTime={appealUntil.toISOString()} className="font-semibold">
                  {appealUntil.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
                .
              </p>
            )}
          </div>
        )}

        {appealSent && (
          <p
            lang={copy.appeal.sent.lang}
            className="rounded-sm border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700"
            role="status"
          >
            {copy.appeal.sent.text}
          </p>
        )}

        {appealError && !appealing && (
          <p
            className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            role="alert"
          >
            {appealError}
          </p>
        )}

        {appealUntil && !appealing && !appealSent && (
          <Button type="button" variant="secondary" onClick={() => setAppealing(true)}>
            <span lang={copy.appeal.open.lang}>{copy.appeal.open.text}</span>
          </Button>
        )}

        {appealUntil && appealing && (
          <div className="space-y-3 rounded-md border border-hairline bg-surface p-4">
            <div lang={copy.appeal.messageLabel.lang}>
              <Textarea
                label={copy.appeal.messageLabel.text}
                hint={copy.appeal.messageHint.text}
                error={appealError ?? undefined}
                rows={5}
                maxLength={APPEAL_MAX}
                value={appealMessage}
                onChange={(event) => {
                  setAppealMessage(event.target.value);
                  setAppealError(null);
                }}
              />
            </div>
            {/* Not a live region: a screen reader would read it out on every
                keystroke. The hint already gives the minimum, and the field
                stops at the maximum. */}
            <p className="text-right text-xs text-ink-subtle" data-numeric>
              {appealMessage.trim().length} / {APPEAL_MAX}
            </p>
            <p lang={copy.appeal.credentials.lang} className="text-sm text-ink-muted">
              {copy.appeal.credentials.text}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" loading={appeal.isPending} onClick={() => void sendAppeal()}>
                <span lang={copy.appeal.submit.lang}>{copy.appeal.submit.text}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={appeal.isPending}
                onClick={() => {
                  setAppealing(false);
                  setAppealError(null);
                }}
              >
                <span lang={copy.appeal.cancel.lang}>{copy.appeal.cancel.text}</span>
              </Button>
            </div>
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
