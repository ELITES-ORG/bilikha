import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';
import { toFieldErrors } from '@/features/auth/field-errors';
import { useBarangays, useMunicipalities } from '@/features/taxonomy/api';
import { SubdomainPicker } from '@/features/taxonomy/components/SubdomainPicker';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useUpdateOwnProfile } from './api';
import type { ContactPreference, OwnProfile, UpdateProfilePayload } from './types';

interface ProfileFormState {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  displayName: string;
  bio: string;
  municipalitySlug: string;
  barangaySlug: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  contactPreference: ContactPreference;
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
  const updateProfile = useUpdateOwnProfile();
  const municipalities = useMunicipalities();
  const [saved, setSaved] = useState<ProfileFormState>(() => toFormState(profile));
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const barangays = useBarangays(form.municipalitySlug || undefined);
  const barangayList = barangays.data ?? [];
  const barangaysUnavailable =
    Boolean(form.municipalitySlug) && !barangays.isPending && barangayList.length === 0;
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

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Public profile</h3>
        <Input
          label="Display name"
          maxLength={80}
          value={form.displayName}
          onChange={(event) => update('displayName', event.target.value)}
          error={fieldErrors.displayName}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="profile-bio" className="text-sm font-medium text-ink">
              Bio
            </label>
            <span className="text-xs tabular-nums text-ink-subtle">
              {form.bio.length} / 1000
            </span>
          </div>
          <textarea
            id="profile-bio"
            rows={7}
            maxLength={1000}
            value={form.bio}
            aria-invalid={fieldErrors.bio ? true : undefined}
            aria-describedby={fieldErrors.bio ? 'profile-bio-error' : undefined}
            onChange={(event) => update('bio', event.target.value)}
            className={cn(
              'w-full resize-y rounded-sm border bg-surface px-3 py-2 text-base text-ink',
              'placeholder:text-ink-subtle focus:outline-none focus-visible:outline-none',
              fieldErrors.bio
                ? 'border-danger-500 focus:border-danger-600 focus:ring-2 focus:ring-danger-100'
                : 'border-hairline-strong hover:border-clay-400 focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100',
            )}
          />
          {fieldErrors.bio && (
            <p id="profile-bio-error" className="text-xs text-danger-700">
              {fieldErrors.bio}
            </p>
          )}
        </div>
        <SubdomainPicker
          selected={form.subdomainSlugs}
          primary={form.primarySubdomainSlug || null}
          onChange={(selected, primary) => {
            setForm((current) => ({
              ...current,
              subdomainSlugs: selected,
              primarySubdomainSlug: primary ?? '',
            }));
            setConfirmation(null);
          }}
          error={fieldErrors.subdomainSlugs ?? fieldErrors.primarySubdomainSlug}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Location</h3>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-municipality" className="text-sm font-medium text-ink">
            Municipality
            <span className="ms-0.5 text-danger-600" aria-hidden="true">
              *
            </span>
          </label>
          <select
            id="profile-municipality"
            required
            value={form.municipalitySlug}
            onChange={(event) => {
              update('municipalitySlug', event.target.value);
              update('barangaySlug', '');
            }}
            className={cn(
              'h-[2.375rem] w-full rounded-sm border bg-surface px-3 text-base text-ink',
              'border-hairline-strong focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none',
              fieldErrors.municipalitySlug && 'border-danger-500',
            )}
          >
            <option value="">Select a municipality</option>
            {municipalities.data?.map((town) => (
              <option key={town.id} value={town.slug}>
                {town.name}
              </option>
            ))}
          </select>
          {fieldErrors.municipalitySlug && (
            <p className="text-xs text-danger-700">{fieldErrors.municipalitySlug}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-barangay" className="text-sm font-medium text-ink">
            Barangay
          </label>
          <select
            id="profile-barangay"
            value={form.barangaySlug}
            disabled={barangaysUnavailable || !form.municipalitySlug}
            onChange={(event) => update('barangaySlug', event.target.value)}
            className={cn(
              'h-[2.375rem] w-full rounded-sm border bg-surface px-3 text-base text-ink',
              'border-hairline-strong focus:border-lawa-600 focus:ring-2 focus:ring-lawa-100 focus:outline-none',
              'disabled:cursor-not-allowed disabled:bg-clay-100 disabled:text-clay-500',
              fieldErrors.barangaySlug && 'border-danger-500',
            )}
          >
            <option value="">
              {barangaysUnavailable ? 'Not yet available' : 'Select a barangay (optional)'}
            </option>
            {barangayList.map((barangay) => (
              <option key={barangay.id} value={barangay.slug}>
                {barangay.name}
              </option>
            ))}
          </select>
          {barangaysUnavailable && (
            <p className="text-xs text-ink-subtle">Barangay list is not yet available.</p>
          )}
          {fieldErrors.barangaySlug && (
            <p className="text-xs text-danger-700">{fieldErrors.barangaySlug}</p>
          )}
        </div>
      </section>

      <fieldset className="space-y-3">
        <legend className="text-lg font-medium text-ink">Contact preference</legend>
        <p className="text-sm text-ink-muted">
          Choose which private contact detail is shared after you respond to an inquiry.
        </p>
        <div className="flex flex-wrap gap-5">
          {(['phone', 'email'] as const).map((preference) => (
            <label key={preference} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="contactPreference"
                value={preference}
                checked={form.contactPreference === preference}
                onChange={() => update('contactPreference', preference)}
                className="size-4 accent-[var(--color-lawa-600)]"
              />
              {preference === 'phone' ? `Phone (${profile.phone})` : `Email (${profile.email})`}
            </label>
          ))}
        </div>
        {fieldErrors.contactPreference && (
          <p className="text-xs text-danger-700">{fieldErrors.contactPreference}</p>
        )}
      </fieldset>

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
