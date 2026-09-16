import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { AvatarUploader } from '@/features/media/AvatarUploader';
import { OfferEditor } from '@/features/offers/OfferEditor';
import { toApiError } from '@/lib/api-client';
import { useUpdateOwnProfile } from './api';
import { ProfileCraftFields, type ProfileCraftFormState } from './ProfileCraftFields';
import type { OwnProfile, UpdateProfilePayload } from './types';

interface ProfileFormState extends ProfileCraftFormState {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
}

function toFormState(profile: OwnProfile): ProfileFormState {
  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? '',
    lastName: profile.lastName,
    suffix: profile.suffix ?? '',
    displayName: profile.displayName ?? '',
    bio: profile.bio ?? '',
    municipalitySlug: profile.municipalitySlug ?? '',
    barangaySlug: profile.barangaySlug ?? '',
    subdomainSlugs: profile.subdomainSlugs,
    primarySubdomainSlug: profile.primarySubdomainSlug ?? '',
    contactPreference: profile.contactPreference,
  };
}

function toPayload(form: ProfileFormState): UpdateProfilePayload {
  return {
    firstName: form.firstName,
    middleName: form.middleName || undefined,
    lastName: form.lastName,
    suffix: form.suffix || undefined,
    displayName: form.displayName || undefined,
    bio: form.bio || undefined,
    municipalitySlug: form.municipalitySlug,
    barangaySlug: form.barangaySlug || undefined,
    subdomainSlugs: form.subdomainSlugs,
    primarySubdomainSlug: form.primarySubdomainSlug,
    contactPreference: form.contactPreference,
  };
}

export function ProfileEditor({ profile }: { profile: OwnProfile }) {
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateOwnProfile();
  const [saved, setSaved] = useState<ProfileFormState>(() => toFormState(profile));
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const unchanged = JSON.stringify(form) === JSON.stringify(saved);

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setConfirmation(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setConfirmation(null);

    if (!form.primarySubdomainSlug) {
      setFieldErrors({
        subdomainSlugs: 'Choose at least one',
        primarySubdomainSlug: 'Choose a primary',
      });
      return;
    }

    try {
      const updated = await updateProfile.mutateAsync(toPayload(form));
      const next = toFormState(updated);
      setForm(next);
      setSaved(next);
      setConfirmation('Profile saved.');
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
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-8" noValidate>
      {profile.status === 'suspended' && profile.rejectionReason && (
        <p
          className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          role="status"
        >
          {profile.rejectionReason}
        </p>
      )}

      {formError && (
        <p
          className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          role="alert"
        >
          {formError}
        </p>
      )}

      {confirmation && (
        <p
          className="rounded-md border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700"
          role="status"
        >
          {confirmation}
        </p>
      )}

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Photo</h3>
        <AvatarUploader
          name={`${form.firstName} ${form.lastName}`.trim() || profile.displayName || 'You'}
          avatarUrl={user?.avatarUrl ?? null}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Name</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            required
            autoComplete="given-name"
            value={form.firstName}
            onChange={(event) => update('firstName', event.target.value)}
            error={fieldErrors.firstName}
          />
          <Input
            label="Middle name"
            value={form.middleName}
            onChange={(event) => update('middleName', event.target.value)}
            error={fieldErrors.middleName}
          />
          <Input
            label="Last name"
            required
            autoComplete="family-name"
            value={form.lastName}
            onChange={(event) => update('lastName', event.target.value)}
            error={fieldErrors.lastName}
          />
          <Input
            label="Suffix"
            placeholder="Jr., Sr., III"
            value={form.suffix}
            onChange={(event) => update('suffix', event.target.value)}
            error={fieldErrors.suffix}
          />
        </div>
      </section>

      <ProfileCraftFields
        form={form}
        fieldErrors={fieldErrors}
        phone={profile.phone}
        email={profile.email}
        onUpdate={(key, value) => {
          setForm((current) => ({ ...current, [key]: value }));
          setFieldErrors((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
          setConfirmation(null);
        }}
        onSubdomainsChange={(selected, primary) => {
          setForm((current) => ({
            ...current,
            subdomainSlugs: selected,
            primarySubdomainSlug: primary ?? '',
          }));
          setConfirmation(null);
        }}
      />

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Offers</h3>
        <OfferEditor />
      </section>

      {profile.status === 'published' && (
        <p className="rounded-md border border-warning-100 bg-warning-50 px-4 py-3 text-sm text-warning-700">
          Your profile stays visible while public changes are reviewed.
        </p>
      )}

      <Button
        type="submit"
        loading={updateProfile.isPending}
        disabled={unchanged || updateProfile.isPending}
      >
        Save profile
      </Button>
    </form>
  );
}
