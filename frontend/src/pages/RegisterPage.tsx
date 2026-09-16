import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRegister } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { Button, ButtonLink, Container, Input } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { withNextParam } from '@/lib/return-path';

const DRAFT_KEY = 'bilikha:register-draft';

interface FormState {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  phone: string;
  birthDate: string;
  privacyConsent: boolean;
  termsAccepted: boolean;
}

const EMPTY_FORM: FormState = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
  phone: '',
  birthDate: '',
  privacyConsent: false,
  termsAccepted: false,
};

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_FORM;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    return {
      ...EMPTY_FORM,
      ...parsed,
      password: '',
      confirmPassword: '',
    };
  } catch {
    return EMPTY_FORM;
  }
}

function saveDraft(form: FormState): void {
  try {
    const { password: _p, confirmPassword: _c, ...rest } = form;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch {
    // Private browsing can throw; draft is best-effort.
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next');
  const register = useRegister();
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    saveDraft(form);
  }, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (!form.privacyConsent || !form.termsAccepted) {
      setFieldErrors({
        ...(form.privacyConsent ? {} : { privacyConsent: 'You must accept the privacy notice' }),
        ...(form.termsAccepted ? {} : { termsAccepted: 'You must accept the terms' }),
      });
      return;
    }

    try {
      await register.mutateAsync({
        firstName: form.firstName,
        middleName: form.middleName || undefined,
        lastName: form.lastName,
        suffix: form.suffix || undefined,
        username: form.username,
        email: form.email,
        phone: form.phone,
        birthDate: form.birthDate,
        password: form.password,
        confirmPassword: form.confirmPassword,
        privacyConsent: true,
        termsAccepted: true,
      });
      clearDraft();
      void navigate(withNextParam('/welcome', nextRaw));
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else {
        setFormError(toApiError(error).message);
      }
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center justify-between">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
          <ButtonLink to={withNextParam('/login', nextRaw)} variant="ghost" size="sm">
            Sign in
          </ButtonLink>
        </Container>
      </header>

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <h1 className="u-display text-3xl text-ink md:text-4xl">Create your account</h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            You can list your creative work in the next step, or add a profile
            later from your account.
          </p>

          <form onSubmit={(event) => void onSubmit(event)} className="mt-10 space-y-10" noValidate>
            {formError && (
              <p
                className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                role="alert"
              >
                {formError}
              </p>
            )}

            <section className="space-y-4">
              <h2 className="text-lg font-medium text-ink">Your name</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="First name"
                  required
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  error={fieldErrors.firstName}
                />
                <Input
                  label="Middle name"
                  value={form.middleName}
                  onChange={(e) => update('middleName', e.target.value)}
                  error={fieldErrors.middleName}
                />
                <Input
                  label="Last name"
                  required
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  error={fieldErrors.lastName}
                />
                <Input
                  label="Suffix"
                  placeholder="Jr., Sr., III"
                  value={form.suffix}
                  onChange={(e) => update('suffix', e.target.value)}
                  error={fieldErrors.suffix}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-medium text-ink">Account</h2>
              <Input
                label="Username"
                required
                autoComplete="username"
                hint="3–30 characters. Letters, numbers, dots and underscores."
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                error={fieldErrors.username}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Password"
                  type="password"
                  required
                  autoComplete="new-password"
                  hint="At least 10 characters."
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  error={fieldErrors.password}
                />
                <Input
                  label="Confirm password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)}
                  error={fieldErrors.confirmPassword}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-medium text-ink">Contact</h2>
              <Input
                label="Email"
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                error={fieldErrors.email}
              />
              <Input
                label="Phone number"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="09171234567"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                error={fieldErrors.phone}
              />
              <Input
                label="Date of birth"
                type="date"
                required
                autoComplete="bday"
                value={form.birthDate}
                onChange={(e) => update('birthDate', e.target.value)}
                error={fieldErrors.birthDate}
              />
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-medium text-ink">Consent</h2>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.privacyConsent}
                  onChange={(e) => update('privacyConsent', e.target.checked)}
                  className="mt-0.5 size-4 rounded-xs accent-[var(--color-lawa-600)]"
                />
                <span>
                  I have read and accept the{' '}
                  <Link to="/privacy" className="link-underline text-lawa-700">
                    privacy notice
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.privacyConsent && (
                <p className="text-xs text-danger-700">{fieldErrors.privacyConsent}</p>
              )}

              <label className="flex items-start gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(e) => update('termsAccepted', e.target.checked)}
                  className="mt-0.5 size-4 rounded-xs accent-[var(--color-lawa-600)]"
                />
                <span>
                  I accept the{' '}
                  <Link to="/terms" className="link-underline text-lawa-700">
                    terms of use
                  </Link>
                  .
                </span>
              </label>
              {fieldErrors.termsAccepted && (
                <p className="text-xs text-danger-700">{fieldErrors.termsAccepted}</p>
              )}
            </section>

            <Button type="submit" size="lg" loading={register.isPending} disabled={register.isPending}>
              Create account
            </Button>
          </form>
        </Container>
      </main>
    </div>
  );
}
