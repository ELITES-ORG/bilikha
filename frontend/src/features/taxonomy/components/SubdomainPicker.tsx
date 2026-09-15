import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCreativeDomains } from '@/features/taxonomy/api';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

const MAX_SELECTED = 5;

export interface SubdomainPickerProps {
  selected: string[];
  primary: string | null;
  onChange: (selected: string[], primary: string | null) => void;
  error?: string;
}

export function SubdomainPicker({ selected, primary, onChange, error }: SubdomainPickerProps) {
  const domains = useCreativeDomains();
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(new Set());

  function toggleDomain(slug: string) {
    setOpenSlugs((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleSubdomain(slug: string) {
    const isSelected = selected.includes(slug);

    if (isSelected) {
      const nextSelected = selected.filter((item) => item !== slug);
      let nextPrimary = primary;
      if (primary === slug) {
        nextPrimary = nextSelected[0] ?? null;
      }
      onChange(nextSelected, nextPrimary);
      return;
    }

    if (selected.length >= MAX_SELECTED) return;

    const nextSelected = [...selected, slug];
    const nextPrimary = primary ?? slug;
    onChange(nextSelected, nextPrimary);
  }

  function setPrimary(slug: string) {
    if (!selected.includes(slug)) return;
    onChange(selected, slug);
  }

  const atLimit = selected.length >= MAX_SELECTED;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">What you do</p>
        <Badge tone={selected.length > 0 ? 'brand' : 'neutral'}>
          {selected.length} of {MAX_SELECTED} selected
        </Badge>
      </div>

      {domains.isPending && <p className="text-sm text-ink-subtle">Loading domains…</p>}

      {domains.isError && (
        <p className="text-sm text-danger-700">{domains.error.message}</p>
      )}

      {domains.data && (
        <div className="divide-y divide-hairline rounded-md border border-hairline">
          {domains.data.map((domain) => {
            const isOpen = openSlugs.has(domain.slug);
            const selectedInDomain = domain.subdomains.filter((sub) =>
              selected.includes(sub.slug),
            ).length;

            return (
              <div key={domain.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleDomain(domain.slug)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-clay-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{domain.name}</span>
                    {selectedInDomain > 0 && (
                      <Badge tone="accent">{selectedInDomain}</Badge>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 text-clay-400 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <ul className="space-y-2 border-t border-hairline bg-surface-sunken px-4 py-3">
                    {domain.subdomains.map((sub) => {
                      const checked = selected.includes(sub.slug);
                      const disabled = !checked && atLimit;

                      return (
                        <li key={sub.id}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-center gap-2 text-sm text-ink',
                              disabled && 'cursor-not-allowed text-clay-400',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleSubdomain(sub.slug)}
                              className="size-4 rounded-xs border-hairline-strong accent-[var(--color-lawa-600)]"
                            />
                            {sub.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <fieldset className="rounded-md border border-hairline p-4">
          <legend className="px-1 text-sm font-medium text-ink">Primary craft</legend>
          <p className="mb-3 text-xs text-ink-subtle">
            Shown first on your profile. Choose one of the crafts you selected.
          </p>
          <ul className="space-y-2">
            {selected.map((slug) => {
              const label =
                domains.data
                  ?.flatMap((domain) => domain.subdomains)
                  .find((sub) => sub.slug === slug)?.name ?? slug;

              return (
                <li key={slug}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="primarySubdomain"
                      checked={primary === slug}
                      onChange={() => setPrimary(slug)}
                      className="size-4 accent-[var(--color-lawa-600)]"
                    />
                    {label}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {error && <p className="text-xs text-danger-700">{error}</p>}
    </div>
  );
}
