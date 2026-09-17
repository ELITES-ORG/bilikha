import { Input, Select } from '@/components/ui';
import { useBarangays, useMunicipalities } from '@/features/taxonomy/api';
import { SubdomainPicker } from '@/features/taxonomy/components/SubdomainPicker';
import { cn } from '@/lib/cn';
import type { ContactPreference } from './types';

export interface ProfileCraftFormState {
  displayName: string;
  bio: string;
  municipalitySlug: string;
  barangaySlug: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
  contactPreference: ContactPreference;
}

interface ProfileCraftFieldsProps {
  form: ProfileCraftFormState;
  fieldErrors: Record<string, string>;
  phone: string;
  email: string;
  /** Profile editor keeps location; setup omits it (already on the account). */
  includeLocation?: boolean;
  onUpdate: <K extends keyof ProfileCraftFormState>(key: K, value: ProfileCraftFormState[K]) => void;
  onSubdomainsChange: (selected: string[], primary: string | null) => void;
}

/** Shared creative craft fields used by account editing and onboarding setup. */
export function ProfileCraftFields({
  form,
  fieldErrors,
  phone,
  email,
  includeLocation = true,
  onUpdate,
  onSubdomainsChange,
}: ProfileCraftFieldsProps) {
  const municipalities = useMunicipalities();
  const barangays = useBarangays(form.municipalitySlug || undefined);
  const barangayList = barangays.data ?? [];
  const barangaysFailed =
    includeLocation &&
    Boolean(form.municipalitySlug) &&
    !barangays.isPending &&
    barangayList.length === 0;

  return (
    <>
      <section className="space-y-4">
        <h3 className="text-lg font-medium text-ink">Public profile</h3>
        <Input
          label="Display name"
          hint="How you appear in the directory. Starts as your username; clear it to show your full name instead."
          maxLength={80}
          value={form.displayName}
          onChange={(event) => onUpdate('displayName', event.target.value)}
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
            onChange={(event) => onUpdate('bio', event.target.value)}
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
          onChange={onSubdomainsChange}
          error={fieldErrors.subdomainSlugs ?? fieldErrors.primarySubdomainSlug}
        />
      </section>

      {includeLocation && (
        <section className="space-y-4">
          <h3 className="text-lg font-medium text-ink">Location</h3>
          <Select
            id="profile-municipality"
            label="Municipality"
            required
            value={form.municipalitySlug}
            placeholder="Select a municipality"
            error={fieldErrors.municipalitySlug}
            onValueChange={(next) => {
              onUpdate('municipalitySlug', next);
              onUpdate('barangaySlug', '');
            }}
            options={(municipalities.data ?? []).map((town) => ({
              value: town.slug,
              label: town.name,
            }))}
          />

          <Select
            id="profile-barangay"
            label="Barangay"
            required
            value={form.barangaySlug}
            disabled={!form.municipalitySlug || barangays.isPending || barangaysFailed}
            placeholder={
              !form.municipalitySlug
                ? 'Select a municipality first'
                : barangays.isPending
                  ? 'Loading…'
                  : 'Select a barangay'
            }
            error={
              fieldErrors.barangaySlug
              ?? (barangaysFailed
                ? 'Could not load barangays for that municipality. Try again.'
                : undefined)
            }
            onValueChange={(next) => onUpdate('barangaySlug', next)}
            options={barangayList.map((barangay) => ({
              value: barangay.slug,
              label: barangay.name,
            }))}
          />
        </section>
      )}

      <fieldset className="space-y-3">
        <legend className="text-lg font-medium text-ink">Contact preference</legend>
        <p className="text-sm text-ink-muted">
          Choose which private contact detail is shared when you choose to share
          it in a conversation.
        </p>
        <div className="flex flex-wrap gap-5">
          {(['phone', 'email'] as const).map((preference) => (
            <label key={preference} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="contactPreference"
                value={preference}
                checked={form.contactPreference === preference}
                onChange={() => onUpdate('contactPreference', preference)}
                className="size-4 accent-[var(--color-lawa-600)]"
              />
              {preference === 'phone' ? `Phone (${phone})` : `Email (${email})`}
            </label>
          ))}
        </div>
        {fieldErrors.contactPreference && (
          <p className="text-xs text-danger-700">{fieldErrors.contactPreference}</p>
        )}
      </fieldset>
    </>
  );
}

