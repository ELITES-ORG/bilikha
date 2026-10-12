import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useRegister } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { useBarangays, useMunicipalities } from '@/features/taxonomy/api';
import { ArrowRight } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import {
  playTransition,
  SESSION_LABEL,
  submitOrigin,
  transitionTo,
} from '@/components/page-transition/transition-to';
import { Button, ButtonLink, Eyebrow, Input, Select } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { withNextParam } from '@/lib/return-path';
import '@/i18n/catalogs/register';
import { useI18n } from '@/i18n/i18n-context';

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
  municipalitySlug: string;
  barangaySlug: string;
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
  municipalitySlug: '',
  barangaySlug: '',
  privacyConsent: false,
  termsAccepted: false,
};

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_FORM;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    const municipalitySlug =
      typeof parsed.municipalitySlug === 'string' ? parsed.municipalitySlug : '';
    let barangaySlug = typeof parsed.barangaySlug === 'string' ? parsed.barangaySlug : '';
    // Stale barangay across a municipality change must not survive restore.
    if (!municipalitySlug) barangaySlug = '';
    return {
      ...EMPTY_FORM,
      ...parsed,
      municipalitySlug,
      barangaySlug,
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
  const { message } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next');
  const register = useRegister();
  const municipalities = useMunicipalities();
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const barangays = useBarangays(form.municipalitySlug || undefined);
  const barangayList = barangays.data ?? [];
  const barangaysFailed =
    Boolean(form.municipalitySlug) && !barangays.isPending && barangayList.length === 0;

  useEffect(() => {
    saveDraft(form);
  }, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function onMunicipalityChange(slug: string) {
    setForm((current) => ({
      ...current,
      municipalitySlug: slug,
      barangaySlug: '',
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const origin = submitOrigin(event);

    const nextErrors: Record<string, string> = {};
    // Client-side checks only. Field errors that come back from the API are
    // still English — server copy is not covered by ADR 0055.
    if (!form.municipalitySlug) {
      nextErrors.municipalitySlug = message('register.errors.municipalityRequired').text;
    }
    if (!form.barangaySlug) nextErrors.barangaySlug = message('register.errors.barangayRequired').text;
    if (!form.privacyConsent) {
      nextErrors.privacyConsent = message('register.errors.privacyRequired').text;
    }
    if (!form.termsAccepted) nextErrors.termsAccepted = message('register.errors.termsRequired').text;
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
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
        municipalitySlug: form.municipalitySlug,
        barangaySlug: form.barangaySlug,
        password: form.password,
        confirmPassword: form.confirmPassword,
        privacyConsent: true,
        termsAccepted: true,
      });
      clearDraft();
      const welcome = withNextParam('/welcome', nextRaw);
      if (!playTransition('bloom', welcome, { label: SESSION_LABEL, origin })) void navigate(welcome);
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else {
        setFormError(toApiError(error).message);
      }
    }
  }

  const copy = {
    signIn: message('register.signIn'),
    eyebrow: message('register.eyebrow'),
    heading: message('register.heading'),
    intro: message('register.intro'),
    nameHeading: message('register.name.heading'),
    firstName: message('register.name.first'),
    middleName: message('register.name.middle'),
    lastName: message('register.name.last'),
    suffix: message('register.name.suffix'),
    accountHeading: message('register.account.heading'),
    username: message('register.account.username'),
    password: message('register.account.password'),
    confirmPassword: message('register.account.confirmPassword'),
    contactHeading: message('register.contact.heading'),
    email: message('register.contact.email'),
    phone: message('register.contact.phone'),
    birthDate: message('register.contact.birthDate'),
    locationHeading: message('register.location.heading'),
    locationIntro: message('register.location.intro'),
    consentHeading: message('register.consent.heading'),
    privacyBefore: message('register.consent.privacyBefore'),
    privacyLink: message('register.consent.privacyLink'),
    privacyAfter: message('register.consent.privacyAfter'),
    termsBefore: message('register.consent.termsBefore'),
    termsLink: message('register.consent.termsLink'),
    termsAfter: message('register.consent.termsAfter'),
    submit: message('register.submit'),
  };

  return (
    <AuthShell
      action={
        <ButtonLink
          to={withNextParam('/login', nextRaw)}
          variant="secondary"
          size="sm"
          onClick={transitionTo('bloom')}
        >
          <span lang={copy.signIn.lang}>{copy.signIn.text}</span>
        </ButtonLink>
      }
    >
      <Eyebrow>
        <span lang={copy.eyebrow.lang}>{copy.eyebrow.text}</span>
      </Eyebrow>
      <h1 lang={copy.heading.lang} className="u-serif mt-4 text-4xl text-ink md:text-5xl">
        {copy.heading.text}
      </h1>
      <p lang={copy.intro.lang} className="mt-3 max-w-xl text-md text-ink-muted">
        {copy.intro.text}
      </p>

      <form onSubmit={(event) => void onSubmit(event)} className="mt-10 space-y-10" noValidate>
        {formError && (
          <p
            className="rounded-sm border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            role="alert"
          >
            {formError}
          </p>
        )}

        <section className="space-y-4">
          <h2 lang={copy.nameHeading.lang} className="text-lg font-bold text-ink">
            {copy.nameHeading.text}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={<span lang={copy.firstName.lang}>{copy.firstName.text}</span>}
              required
              autoComplete="given-name"
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              error={fieldErrors.firstName}
            />
            <Input
              label={<span lang={copy.middleName.lang}>{copy.middleName.text}</span>}
              value={form.middleName}
              onChange={(e) => update('middleName', e.target.value)}
              error={fieldErrors.middleName}
            />
            <Input
              label={<span lang={copy.lastName.lang}>{copy.lastName.text}</span>}
              required
              autoComplete="family-name"
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              error={fieldErrors.lastName}
            />
            <Input
              label={<span lang={copy.suffix.lang}>{copy.suffix.text}</span>}
              placeholder={message('register.name.suffixPlaceholder').text}
              value={form.suffix}
              onChange={(e) => update('suffix', e.target.value)}
              error={fieldErrors.suffix}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 lang={copy.accountHeading.lang} className="text-lg font-bold text-ink">
            {copy.accountHeading.text}
          </h2>
          <Input
            label={<span lang={copy.username.lang}>{copy.username.text}</span>}
            required
            autoComplete="username"
            hint={message('register.account.usernameHint').text}
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            error={fieldErrors.username}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={<span lang={copy.password.lang}>{copy.password.text}</span>}
              type="password"
              required
              autoComplete="new-password"
              hint={message('register.account.passwordHint').text}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              error={fieldErrors.password}
            />
            <Input
              label={<span lang={copy.confirmPassword.lang}>{copy.confirmPassword.text}</span>}
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
          <h2 lang={copy.contactHeading.lang} className="text-lg font-bold text-ink">
            {copy.contactHeading.text}
          </h2>
          <Input
            label={<span lang={copy.email.lang}>{copy.email.text}</span>}
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            error={fieldErrors.email}
          />
          <Input
            label={<span lang={copy.phone.lang}>{copy.phone.text}</span>}
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="09171234567"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            error={fieldErrors.phone}
          />
          <Input
            label={<span lang={copy.birthDate.lang}>{copy.birthDate.text}</span>}
            type="date"
            required
            autoComplete="bday"
            value={form.birthDate}
            onChange={(e) => update('birthDate', e.target.value)}
            error={fieldErrors.birthDate}
          />
        </section>

        <section className="space-y-4">
          <h2 lang={copy.locationHeading.lang} className="text-lg font-bold text-ink">
            {copy.locationHeading.text}
          </h2>
          <p lang={copy.locationIntro.lang} className="text-sm text-ink-muted">
            {copy.locationIntro.text}
          </p>
          <Select
            id="register-municipality"
            label={message('register.location.municipality').text}
            required
            value={form.municipalitySlug}
            placeholder={message('register.location.municipalityPlaceholder').text}
            error={fieldErrors.municipalitySlug}
            onValueChange={onMunicipalityChange}
            options={(municipalities.data ?? []).map((town) => ({
              value: town.slug,
              label: town.name,
            }))}
          />

          <Select
            id="register-barangay"
            label={message('register.location.barangay').text}
            required
            value={form.barangaySlug}
            disabled={!form.municipalitySlug || barangays.isPending || barangaysFailed}
            placeholder={
              !form.municipalitySlug
                ? message('register.location.barangayNeedsMunicipality').text
                : barangays.isPending
                  ? message('register.location.barangayLoading').text
                  : message('register.location.barangayPlaceholder').text
            }
            error={
              fieldErrors.barangaySlug
              ?? (barangaysFailed
                ? message('register.location.barangaysFailed').text
                : undefined)
            }
            onValueChange={(next) => update('barangaySlug', next)}
            options={barangayList.map((barangay) => ({
              value: barangay.slug,
              label: barangay.name,
            }))}
          />
        </section>

        <section className="space-y-4">
          <h2 lang={copy.consentHeading.lang} className="text-lg font-bold text-ink">
            {copy.consentHeading.text}
          </h2>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(e) => update('privacyConsent', e.target.checked)}
              className="mt-0.5 size-4 rounded-xs accent-primary"
            />
            <span>
              <span lang={copy.privacyBefore.lang}>{copy.privacyBefore.text}</span>
              <Link
                to="/privacy"
                lang={copy.privacyLink.lang}
                className="link-underline text-navy-700"
                onClick={transitionTo('wave')}
              >
                {copy.privacyLink.text}
              </Link>
              <span lang={copy.privacyAfter.lang}>{copy.privacyAfter.text}</span>
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
              className="mt-0.5 size-4 rounded-xs accent-primary"
            />
            <span>
              <span lang={copy.termsBefore.lang}>{copy.termsBefore.text}</span>
              <Link
                to="/terms"
                lang={copy.termsLink.lang}
                className="link-underline text-navy-700"
                onClick={transitionTo('wave')}
              >
                {copy.termsLink.text}
              </Link>
              <span lang={copy.termsAfter.lang}>{copy.termsAfter.text}</span>
            </span>
          </label>
          {fieldErrors.termsAccepted && (
            <p className="text-xs text-danger-700">{fieldErrors.termsAccepted}</p>
          )}
        </section>

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="sm:w-auto sm:min-w-64"
          loading={register.isPending}
          disabled={register.isPending}
          iconRight={<ArrowRight className="size-4" aria-hidden="true" />}
        >
          <span lang={copy.submit.lang}>{copy.submit.text}</span>
        </Button>
      </form>
    </AuthShell>
  );
}
