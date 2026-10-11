import { Input, Select, Textarea } from '@/components/ui';
import { useMunicipalities } from '@/features/taxonomy/api';
import { SubdomainPicker } from '@/features/taxonomy/components/SubdomainPicker';
import { useT } from '@/i18n/i18n-context';
import { Message } from '@/i18n/Message';

export interface OrganizationFormState {
  name: string;
  bio: string;
  municipalitySlug: string;
  subdomainSlugs: string[];
  primarySubdomainSlug: string;
}

interface OrganizationFieldsProps {
  form: OrganizationFormState;
  fieldErrors: Record<string, string>;
  /** Only the founder sets the crafts (ADR 0054); a co-founder sees them read-only. */
  canEditCrafts: boolean;
  /** Names of the current crafts, shown when `canEditCrafts` is false. */
  craftNames?: string[];
  onUpdate: <K extends keyof OrganizationFormState>(key: K, value: OrganizationFormState[K]) => void;
}

/** The page's fields, shared by founding and editing. Every one is public. */
export function OrganizationFields({
  form,
  fieldErrors,
  canEditCrafts,
  craftNames = [],
  onUpdate,
}: OrganizationFieldsProps) {
  const t = useT();
  const municipalities = useMunicipalities();

  return (
    <div className="space-y-6">
      <Input
        label={<Message k="organizations.fields.name" />}
        hint={t('organizations.fields.nameHint')}
        required
        maxLength={80}
        value={form.name}
        onChange={(event) => onUpdate('name', event.target.value)}
        error={fieldErrors.name}
      />
      <Textarea
        label={t('organizations.fields.bio')}
        hint={`${t('organizations.fields.bioHint')} ${form.bio.length} / 1000`}
        rows={6}
        maxLength={1000}
        value={form.bio}
        onChange={(event) => onUpdate('bio', event.target.value)}
        error={fieldErrors.bio}
      />
      <Select
        id="organization-municipality"
        label={t('organizations.fields.municipality')}
        required
        value={form.municipalitySlug}
        placeholder={t('organizations.fields.municipalityPlaceholder')}
        error={fieldErrors.municipalitySlug}
        onValueChange={(next) => onUpdate('municipalitySlug', next)}
        options={(municipalities.data ?? []).map((town) => ({
          value: town.slug,
          label: town.name,
        }))}
      />
      {canEditCrafts ? (
        <div>
          <SubdomainPicker
            selected={form.subdomainSlugs}
            primary={form.primarySubdomainSlug || null}
            onChange={(selected, primary) => {
              onUpdate('subdomainSlugs', selected);
              onUpdate('primarySubdomainSlug', primary ?? '');
            }}
            error={fieldErrors.subdomainSlugs ?? fieldErrors.primarySubdomainSlug}
          />
          <p className="mt-2 text-xs text-ink-subtle">
            <Message k="organizations.fields.craftsLimit" />
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-ink">
            <Message k="organizations.fields.crafts" />
          </p>
          <p className="mt-1.5 text-sm text-ink-muted">{craftNames.join(' · ')}</p>
          <p className="mt-1 text-xs text-ink-subtle">
            <Message k="organizations.fields.craftsFounderOnly" />
          </p>
        </div>
      )}
    </div>
  );
}
