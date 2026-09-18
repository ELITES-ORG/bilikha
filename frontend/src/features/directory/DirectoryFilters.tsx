import { Button, Select } from '@/components/ui';
import type { CreativeDomain, Municipality } from '@/features/taxonomy/types';

export type DirectoryFiltersProps = {
  domain: string | undefined;
  subdomain: string | undefined;
  municipality: string | undefined;
  selectedDomain: CreativeDomain | undefined;
  domains: CreativeDomain[] | undefined;
  municipalities: Municipality[] | undefined;
  showBudget: boolean;
  draftBudgetMin: string;
  draftBudgetMax: string;
  budgetInvalid: boolean;
  onFilter: (next: Record<string, string | undefined>) => void;
  onDraftBudgetMinChange: (value: string) => void;
  onDraftBudgetMaxChange: (value: string) => void;
  onBudgetBlur: () => void;
  onApplyBudget: () => void;
};

/**
 * The filter fields alone — no open/closed state, no chrome. The phone panel
 * and the desktop rail both render this against the same `onFilter` /
 * budget handlers so the two presentations cannot drift (ADR 0036).
 */
export function DirectoryFilters({
  domain,
  subdomain,
  municipality,
  selectedDomain,
  domains,
  municipalities,
  showBudget,
  draftBudgetMin,
  draftBudgetMax,
  budgetInvalid,
  onFilter,
  onDraftBudgetMinChange,
  onDraftBudgetMaxChange,
  onBudgetBlur,
  onApplyBudget,
}: DirectoryFiltersProps) {
  return (
    <div className="grid gap-4">
      <Select
        label="Domain"
        value={domain ?? ''}
        placeholder="All domains"
        onValueChange={(next) =>
          onFilter({ domain: next || undefined, subdomain: undefined })
        }
        options={[
          { value: '', label: 'All domains' },
          ...(domains ?? []).map((d) => ({ value: d.slug, label: d.name })),
        ]}
      />

      <Select
        label="Sub-domain"
        value={subdomain ?? ''}
        placeholder="All sub-domains"
        disabled={!selectedDomain}
        onValueChange={(next) => onFilter({ subdomain: next || undefined })}
        options={[
          { value: '', label: 'All sub-domains' },
          ...(selectedDomain?.subdomains ?? []).map((sd) => ({
            value: sd.slug,
            label: sd.name,
          })),
        ]}
      />

      <Select
        label="Municipality"
        value={municipality ?? ''}
        placeholder="All municipalities"
        onValueChange={(next) => onFilter({ municipality: next || undefined })}
        options={[
          { value: '', label: 'All municipalities' },
          ...(municipalities ?? []).map((m) => ({
            value: m.slug,
            label: m.name,
          })),
        ]}
      />

      {showBudget && (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-ink">Budget (₱)</legend>
          <p className="text-xs text-ink-muted">
            Optional. Leave blank for any price, including price on request.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Min
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Any"
                value={draftBudgetMin}
                onChange={(e) => onDraftBudgetMinChange(e.target.value)}
                onBlur={onBudgetBlur}
                className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Max
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="Any"
                value={draftBudgetMax}
                onChange={(e) => onDraftBudgetMaxChange(e.target.value)}
                onBlur={onBudgetBlur}
                className="h-[2.375rem] rounded-sm border border-hairline-strong bg-surface px-3 text-base tabular-nums"
              />
            </label>
          </div>
          {budgetInvalid && (
            <p className="text-xs text-danger-700">
              Maximum must be at least the minimum.
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={budgetInvalid}
            onClick={onApplyBudget}
          >
            Apply budget
          </Button>
        </fieldset>
      )}
    </div>
  );
}
