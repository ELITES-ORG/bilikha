import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser, useLogin, useRegister } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { useSendInquiry } from '@/features/inquiries/api';
import {
  clearInquiryDraft,
  loadInquiryDraft,
  saveInquiryDraft,
  type InquiryDraft,
} from '@/features/inquiries/draft';
import { Button, Input } from '@/components/ui';
import { toApiError } from '@/lib/api-client';

interface InquiryComposerProps {
  profileSlug: string;
  creativeName: string;
}

type Phase = 'compose' | 'auth' | 'sending' | 'done';

function initialDraft(profileSlug: string): InquiryDraft {
  return loadInquiryDraft(profileSlug) ?? { subject: '', message: '' };
}

export function InquiryComposer({ profileSlug, creativeName }: InquiryComposerProps) {
  const { data: user } = useCurrentUser();
  const send = useSendInquiry();
  const register = useRegister();
  const login = useLogin();

  const [phase, setPhase] = useState<Phase>('compose');
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [subject, setSubject] = useState(() => initialDraft(profileSlug).subject);
  const [message, setMessage] = useState(() => initialDraft(profileSlug).message);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [reg, setReg] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phone: '',
    birthDate: '',
    password: '',
    confirmPassword: '',
    privacyConsent: false,
    termsAccepted: false,
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  async function submitInquiry(draft: InquiryDraft) {
    setPhase('sending');
    setError(null);
    try {
      await send.mutateAsync({
        profileSlug,
        subject: draft.subject,
        message: draft.message,
      });
      clearInquiryDraft(profileSlug);
      setPhase('done');
    } catch (err) {
      setPhase(user ? 'compose' : 'auth');
      setError(toApiError(err).message);
    }
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const draft: InquiryDraft = { subject: subject.trim(), message: message.trim() };
    if (draft.subject.length < 3) {
      setFieldErrors({ subject: 'Too short' });
      return;
    }
    if (draft.message.length < 20) {
      setFieldErrors({ message: 'Give a little more detail' });
      return;
    }

    saveInquiryDraft(profileSlug, draft);

    if (!user) {
      setPhase('auth');
      return;
    }

    await submitInquiry(draft);
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!reg.privacyConsent || !reg.termsAccepted) {
      setError('Accept the privacy notice and terms to continue.');
      return;
    }

    try {
      await register.mutateAsync({
        kind: 'client',
        firstName: reg.firstName,
        lastName: reg.lastName,
        username: reg.username,
        email: reg.email,
        phone: reg.phone,
        birthDate: reg.birthDate,
        password: reg.password,
        confirmPassword: reg.confirmPassword,
        privacyConsent: true,
        termsAccepted: true,
      });
      const draft = loadInquiryDraft(profileSlug) ?? {
        subject: subject.trim(),
        message: message.trim(),
      };
      await submitInquiry(draft);
    } catch (err) {
      const fields = toFieldErrors(err);
      setFieldErrors(fields);
      if (Object.keys(fields).length === 0) setError(toApiError(err).message);
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync(loginForm);
      const draft = loadInquiryDraft(profileSlug) ?? {
        subject: subject.trim(),
        message: message.trim(),
      };
      await submitInquiry(draft);
    } catch (err) {
      setError(toApiError(err).message);
    }
  }

  if (phase === 'done') {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-6">
        <h2 className="u-display text-2xl text-ink">Inquiry sent</h2>
        <p className="mt-3 text-base text-ink-muted text-pretty">
          {creativeName} will see this in their Bilikha inbox. There is no email
          notification — check your sent inquiries for a response.
        </p>
        <Link to="/inquiries" className="link-underline mt-6 inline-block text-base text-lawa-700">
          View sent inquiries
        </Link>
      </div>
    );
  }

  if (phase === 'auth') {
    return (
      <div className="rounded-sm border border-hairline bg-surface p-6">
        <h2 className="u-display text-2xl text-ink">
          {authMode === 'register' ? 'Create an account to send' : 'Sign in to send'}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your message is saved. It will send as soon as you finish.
        </p>

        {error && <p className="mt-4 text-sm text-danger-700">{error}</p>}

        {authMode === 'register' ? (
          <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(e) => void onRegister(e)}>
            <Input
              label="First name"
              required
              value={reg.firstName}
              onChange={(e) => setReg((s) => ({ ...s, firstName: e.target.value }))}
              error={fieldErrors.firstName}
            />
            <Input
              label="Last name"
              required
              value={reg.lastName}
              onChange={(e) => setReg((s) => ({ ...s, lastName: e.target.value }))}
              error={fieldErrors.lastName}
            />
            <Input
              label="Username"
              required
              value={reg.username}
              onChange={(e) => setReg((s) => ({ ...s, username: e.target.value }))}
              error={fieldErrors.username}
            />
            <Input
              label="Email"
              type="email"
              required
              value={reg.email}
              onChange={(e) => setReg((s) => ({ ...s, email: e.target.value }))}
              error={fieldErrors.email}
            />
            <Input
              label="Phone"
              required
              value={reg.phone}
              onChange={(e) => setReg((s) => ({ ...s, phone: e.target.value }))}
              error={fieldErrors.phone}
            />
            <Input
              label="Birth date"
              type="date"
              required
              value={reg.birthDate}
              onChange={(e) => setReg((s) => ({ ...s, birthDate: e.target.value }))}
              error={fieldErrors.birthDate}
            />
            <Input
              label="Password"
              type="password"
              required
              value={reg.password}
              onChange={(e) => setReg((s) => ({ ...s, password: e.target.value }))}
              error={fieldErrors.password}
            />
            <Input
              label="Confirm password"
              type="password"
              required
              value={reg.confirmPassword}
              onChange={(e) => setReg((s) => ({ ...s, confirmPassword: e.target.value }))}
              error={fieldErrors.confirmPassword}
            />
            <label className="flex items-start gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={reg.privacyConsent}
                onChange={(e) => setReg((s) => ({ ...s, privacyConsent: e.target.checked }))}
              />
              I accept the privacy notice
            </label>
            <label className="flex items-start gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={reg.termsAccepted}
                onChange={(e) => setReg((s) => ({ ...s, termsAccepted: e.target.checked }))}
              />
              I accept the terms
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" loading={register.isPending || send.isPending}>
                Create account and send
              </Button>
              <button
                type="button"
                className="link-underline text-sm text-ink-muted"
                onClick={() => setAuthMode('login')}
              >
                Already have an account? Sign in
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-6 grid max-w-sm gap-4" onSubmit={(e) => void onLogin(e)}>
            <Input
              label="Username"
              required
              value={loginForm.username}
              onChange={(e) => setLoginForm((s) => ({ ...s, username: e.target.value }))}
            />
            <Input
              label="Password"
              type="password"
              required
              value={loginForm.password}
              onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={login.isPending || send.isPending}>
                Sign in and send
              </Button>
              <button
                type="button"
                className="link-underline text-sm text-ink-muted"
                onClick={() => setAuthMode('register')}
              >
                Need an account? Register
              </button>
            </div>
          </form>
        )}

        <button
          type="button"
          className="link-underline mt-6 text-sm text-ink-muted"
          onClick={() => setPhase('compose')}
        >
          Back to message
        </button>
      </div>
    );
  }

  return (
    <form className="rounded-sm border border-hairline bg-surface p-6" onSubmit={(e) => void onSend(e)}>
      <h2 className="u-display text-2xl text-ink">Contact {creativeName}</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Write your message first. You will only need an account when you send it.
      </p>

      {error && <p className="mt-4 text-sm text-danger-700">{error}</p>}

      <div className="mt-6 grid gap-4">
        <Input
          label="Subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          error={fieldErrors.subject}
          maxLength={120}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inquiry-message" className="text-sm font-medium text-ink">
            Message<span className="ms-0.5 text-danger-600">*</span>
          </label>
          <textarea
            id="inquiry-message"
            required
            rows={6}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-2 text-base text-ink focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none"
            aria-invalid={fieldErrors.message ? true : undefined}
          />
          <div className="flex justify-between text-xs text-ink-subtle">
            <span>{fieldErrors.message ?? 'At least 20 characters'}</span>
            <span className="tabular-nums">{message.length}/2000</span>
          </div>
        </div>
        <Button type="submit" size="lg" loading={phase === 'sending' || send.isPending}>
          Send inquiry
        </Button>
      </div>
    </form>
  );
}
