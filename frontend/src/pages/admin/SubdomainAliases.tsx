import { useState, type FormEvent } from 'react';
import { CircleCheck, SearchX, TriangleAlert, X } from 'lucide-react';
import { Button, EmptyState, Input, Skeleton, useToast } from '@/components/ui';
import {
  useAddAlias,
  useRemoveAlias,
  useSearchMisses,
  type AdminTaxonomySubdomain,
} from '@/features/admin/taxonomy-api';
import { toApiError } from '@/lib/api-client';
import { AdminSection, adminListClass } from './admin-ui';

/**
 * Everyday words for one craft (issue #24, plan 0057). Search matches them as
 * it matches the craft's own name, by prefix and with a typo, so one spelling
 * of a word is enough. They are never shown to the public.
 */
export function SubdomainAliases({ subdomain }: { subdomain: AdminTaxonomySubdomain }) {
  const toast = useToast();
  const add = useAddAlias();
  const remove = useRemoveAlias();
  const [term, setTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await add.mutateAsync({ slug: subdomain.slug, term });
      setTerm('');
    } catch (cause) {
      setError(toApiError(cause).message);
    }
  }

  async function onRemove(id: string, word: string) {
    try {
      await toast.run('Removing…', () => remove.mutateAsync({ slug: subdomain.slug, id }), {
        success: `"${word}" removed`,
        error: (cause) => toApiError(cause).message,
      });
    } catch {
      // Already reported in the toast.
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-hairline bg-surface p-4">
      <div>
        <p className="text-sm font-semibold text-ink">Everyday words</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          What people call {subdomain.name} when they search — in Waray, Cebuano, Tagalog or
          English, and the misspellings they actually type. Written by someone who speaks it.
        </p>
      </div>

      {subdomain.aliases.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Everyday words for ${subdomain.name}`}>
          {subdomain.aliases.map((alias) => (
            <li
              key={alias.id}
              className="inline-flex items-center gap-1 rounded-full border border-hairline-strong bg-paper py-0.5 pr-1 pl-3 text-sm text-ink"
            >
              <span className="break-all">{alias.term}</span>
              <button
                type="button"
                className="u-tap grid size-7 place-items-center rounded-full text-ink-subtle hover:bg-slate-100 hover:text-ink"
                aria-label={`Remove "${alias.term}"`}
                disabled={remove.isPending}
                onClick={() => void onRemove(alias.id, alias.term)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-subtle">None yet. Search finds it by its name only.</p>
      )}

      <form onSubmit={(event) => void onAdd(event)} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
        <div className="sm:flex-1">
          <Input
            label="Add a word"
            hint="Accents and capitals do not matter."
            maxLength={60}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setError(null);
            }}
            error={error ?? undefined}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="sm:mt-7"
          loading={add.isPending}
          disabled={add.isPending || !term.trim()}
        >
          Add
        </Button>
      </form>
    </div>
  );
}

const WINDOW_DAYS = 30;

const LISTING_LABEL = { offers: 'Offers', creatives: 'Creatives' } as const;

/**
 * The most common searches that found nothing (issue #24). Counted by word and
 * day, never by person. A word that keeps coming back is a missing everyday
 * word — or, rarely, a missing craft.
 */
export function UnmatchedSearches() {
  const misses = useSearchMisses(WINDOW_DAYS);

  return (
    <AdminSection
      title="Searches that found nothing"
      description={`The last ${WINDOW_DAYS} days, most frequent first. If a word here means a craft, add it to that craft above. Nothing here says who searched.`}
    >
      {misses.isPending && <Skeleton className="h-28 w-full" />}

      {misses.isError && (
        <EmptyState
          icon={<TriangleAlert className="size-5" />}
          title="Could not load unmatched searches"
          description={misses.error.message}
        />
      )}

      {misses.data?.length === 0 && (
        <EmptyState
          icon={<CircleCheck className="size-5" />}
          title="Every search found something"
          description={`No search came up empty in the last ${WINDOW_DAYS} days.`}
        />
      )}

      {misses.data && misses.data.length > 0 && (
        <ul className={adminListClass}>
          {misses.data.map((miss) => (
            <li
              key={`${miss.listing}:${miss.term}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <p className="flex min-w-0 items-baseline gap-2 text-sm text-ink">
                <SearchX className="size-4 shrink-0 self-center text-ink-subtle" aria-hidden="true" />
                <span className="font-semibold break-all">{miss.term}</span>
                <span className="text-ink-muted">in {LISTING_LABEL[miss.listing]}</span>
              </p>
              <p className="text-sm text-ink-muted" data-numeric>
                {miss.count} {miss.count === 1 ? 'search' : 'searches'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
  );
}
