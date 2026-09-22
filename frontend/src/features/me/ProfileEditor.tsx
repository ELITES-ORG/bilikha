import { useState, type FormEvent } from 'react';
import { Button, Input, useToast } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { toFieldErrors } from '@/features/auth/field-errors';
import { AvatarUploader } from '@/features/media/AvatarUploader';
import { toApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
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
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateOwnProfile();
  const [saved, setSaved] = useState<ProfileFormState>(() => toFormState(profile));
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(profile));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const unchanged = JSON.stringify(form) === JSON.stringify(saved);
  const dirty = !unchanged;

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
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

    try {
      await toast.run(
        'Saving profile…',
        async () => {
          const updated = await updateProfile.mutateAsync(toPayload(form));
          const next = toFormState(updated);
          setForm(next);
          setSaved(next);
        },
        {
          success: 'Profile saved',
          // Field errors are rendered against their inputs, but those can be
          // scrolled out of view — the toast says where to look.
          error: (error) =>
            Object.keys(toFieldErrors(error)).length > 0
              ? 'Check the highlighted fields'
              : toApiError(error).message,
        },
      );
    } catch (error) {
      const mapped = toFieldErrors(error);
      if (Object.keys(mapped).length > 0) {
        setFieldErrors(mapped);
      } else {
        setFormError(toApiError(error).message);
      }
    }
  }

  const saveButton = (
    <Button
      type="submit"
      loading={updateProfile.isPending}
      disabled={unchanged || updateProfile.isPending}
    >
      Save profile
    </Button>
  );

  const nameFields = (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-ink">Name</h3>
      <p className="text-xs text-ink-subtle">
        First, middle, last and suffix all appear as your full name on the
        directory and your public profile.
      </p>
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
    </div>
  );

  const photoBlock = (
    <div className="space-y-2">
      <AvatarUploader
        name={`${form.firstName} ${form.lastName}`.trim() || profile.displayName || 'You'}
        avatarUrl={user?.avatarUrl ?? null}
      />
      <p className="text-xs text-ink-subtle">
        Saved as soon as you upload — no need to press Save profile.
      </p>
    </div>
  );

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className={cn('space-y-8', dirty && 'pb-24')}
      noValidate
    >
      {profile.status === 'suspended' && profile.rejectionReason && (
        <p
          className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700"
          role="status"
        >
          {profile.rejectionReason}
        </p>
      )}

      {profile.status === 'published' && (
        <p className="rounded-md border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700">
          Your profile stays visible while public changes are reviewed.
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

      <ProfileCraftFields
        form={form}
        fieldErrors={fieldErrors}
        phone={profile.phone}
        email={profile.email}
        groupByVisibility
        leadingPublic={
          <>
            {photoBlock}
            {nameFields}
          </>
        }
        onUpdate={(key, value) => {
          setForm((current) => ({ ...current, [key]: value }));
          setFieldErrors((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
        }}
        onSubdomainsChange={(selected, primary) => {
          setForm((current) => ({
            ...current,
            subdomainSlugs: selected,
            primarySubdomainSlug: primary ?? '',
          }));
        }}
      />

      {/*
        Sticky save when dirty so a 3-screen form does not hide whether an edit
        registered. Bottom offset matches the phone tab bar (see bottom-nav.ts).
        Complete literals only — Tailwind emits nothing for composed class names.
      */}
      {dirty ? (
        <div
          className={cn(
            'fixed inset-x-0 z-30 border-t border-hairline bg-paper/95 px-(--gutter) py-3 backdrop-blur-sm',
            'max-sm:bottom-[calc(var(--bottom-nav-h)+1px+env(safe-area-inset-bottom,0px))]',
            'sm:bottom-0',
          )}
        >
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Unsaved changes</p>
            {saveButton}
          </div>
        </div>
      ) : (
        saveButton
      )}
    </form>
  );
}
