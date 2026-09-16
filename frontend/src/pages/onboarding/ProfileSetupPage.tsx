import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUser } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { useCreateOwnProfile, useOwnProfile } from '@/features/me/api';
import {
  ProfileCraftFields,
  type ProfileCraftFormState,
} from '@/features/me/ProfileCraftFields';
import type { CreateProfilePayload } from '@/features/me/types';
import { Button, Container, Skeleton } from '@/components/ui';
import { toApiError } from '@/lib/api-client';
import { safeReturnPath, withNextParam } from '@/lib/return-path';

const EMPTY_FORM: ProfileCraftFormState = {
  displayName: '',
  bio: '',
  municipalitySlug: '',
  barangaySlug: '',
  subdomainSlugs: [],
  primarySubdomainSlug: '',
  contactPreference: 'phone',
};

export function ProfileSetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAccount = searchParams.get('from') === 'account';
  const next = safeReturnPath(searchParams.get('next'), '');
  const { data: user } = useCurrentUser();
  const existing = useOwnProfile();
  const createProfile = useCreateOwnProfile();

  const [form, setForm] = useState<ProfileCraftFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof ProfileCraftFormState>(key: K, value: ProfileCraftFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    if (!form.primarySubdomainSlug) {
      setFieldErrors({
        subdomainSlugs: 'Choose at least one',
        primarySubdomainSlug: 'Choose a primary',
      });
      return;
    }

    const payload: CreateProfilePayload = {
      displayName: form.displayName || undefined,
      bio: form.bio || undefined,
      municipalitySlug: form.municipalitySlug,
      barangaySlug: form.barangaySlug || undefined,
      subdomainSlugs: form.subdomainSlugs,
      primarySubdomainSlug: form.primarySubdomainSlug,
      contactPreference: form.contactPreference,
    };

    try {
      await createProfile.mutateAsync(payload);
      void navigate(withNextParam('/welcome/submitted', next || null));
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else {
        setFormError(toApiError(error).message);
      }
    }
  }

  if (existing.isPending) {
    return (
      <div className="min-h-dvh bg-paper">
        <Container width="narrow" className="py-(--section-gap)">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-64 w-full" />
        </Container>
      </div>
    );
  }

  if (existing.data) {
    return <Navigate to={withNextParam('/welcome/submitted', next || null)} replace />;
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-hairline">
        <Container width="narrow" className="flex h-16 items-center">
          <Link to="/" className="u-display text-xl font-semibold text-ink">
            Bilikha
          </Link>
        </Container>
      </header>

      <main>
        <Container width="narrow" className="py-(--section-gap)">
          <p className="u-eyebrow">{fromAccount ? 'Add a creative profile' : 'Step 2 of 2'}</p>
          <h1 className="u-display mt-3 text-3xl text-ink md:text-4xl">
            {fromAccount ? 'Offer your creative work' : 'Set up your creative profile'}
          </h1>
          <p className="mt-3 max-w-xl text-md text-ink-muted">
            {fromAccount
              ? 'Your profile is reviewed before it appears in the directory.'
              : 'Tell people what you make. Your profile is reviewed before it appears in the directory.'}
          </p>

          <form onSubmit={(event) => void onSubmit(event)} className="mt-10 space-y-8" noValidate>
            {formError && (
              <p
                className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
                role="alert"
              >
                {formError}
              </p>
            )}

            <ProfileCraftFields
              form={form}
              fieldErrors={fieldErrors}
              phone="on file"
              email={user?.email ?? 'on file'}
              onUpdate={update}
              onSubdomainsChange={(selected, primary) => {
                setForm((current) => ({
                  ...current,
                  subdomainSlugs: selected,
                  primarySubdomainSlug: primary ?? '',
                }));
              }}
            />

            <Button
              type="submit"
              size="lg"
              loading={createProfile.isPending}
              disabled={createProfile.isPending}
            >
              Submit for review
            </Button>
          </form>
        </Container>
      </main>
    </div>
  );
}
