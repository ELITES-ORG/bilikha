import type { AdminMediaRow } from '@contracts/admin';
import type { Paginated } from '@contracts/pagination';
import { useMemo, useState } from 'react';
import { CheckCircle2, Inbox, Search } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import { Button, EmptyState, Input } from '@/components/ui';
import { AdminToolbar } from '../admin-ui';
import { ReviewCard, ReviewCardSkeleton, type ReviewAction } from './ReviewCard';
import { countFlagged, filterAndSortReview, type SortOrder } from './review-list-logic';

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'queue', label: 'Flagged first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/** One column on a phone, two from `sm`, three from `lg`. */
const gridClass = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6';

/** The server returns at most this many; the note below says when there are more. */
const PAGE_SIZE = 50;

const contentReviewKey = ['admin', 'media'] as const;

interface ContentReviewListProps {
  kind: AdminMediaRow['kind'];
  /** For offers: new ones, or changes to published ones. */
  change?: 'new' | 'edit';
  /** What the empty list says. */
  empty: { title: string; description: string };
  /** What the search box is for, e.g. "Search offers". */
  searchLabel: string;
  searchPlaceholder: string;
}

/**
 * One subject's waiting items (ADR 0059) — offers, profile photos, or
 * organisation logos — as cards with Approve and Reject. The page around it
 * owns the heading and tabs; this owns the list, its search, and the decision.
 */
export function ContentReviewList({ kind, change, empty, searchLabel, searchPlaceholder }: ContentReviewListProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('queue');

  const list = useQuery({
    queryKey: [...contentReviewKey, kind, change ?? 'all'],
    queryFn: async (): Promise<Paginated<AdminMediaRow>> => {
      try {
        const { data } = await apiClient.get<Paginated<AdminMediaRow>>('/admin/media', {
          params: { page: 1, limit: PAGE_SIZE, kind, ...(change ? { change } : {}) },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });

  const review = useMutation({
    mutationFn: async (input: { item: AdminMediaRow; action: ReviewAction; reason?: string }) => {
      try {
        await apiClient.post(`/admin/media/${input.item.kind}/${input.item.id}/review`, {
          action: input.action,
          ...(input.reason ? { reason: input.reason } : {}),
          // The decision is about this version; the server refuses it if the
          // owner has changed the item since the list loaded.
          version: input.item.version,
        });
      } catch (error) {
        throw toApiError(error);
      }
    },
    // After a refusal too: an item changed or withdrawn since the list loaded
    // reappears as it is now, or leaves.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: contentReviewKey });
    },
  });

  const items = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;
  const flagged = useMemo(() => countFlagged(items), [items]);
  const visible = useMemo(() => filterAndSortReview(items, query, sort), [items, query, sort]);
  const searching = query.trim() !== '';

  function act(item: AdminMediaRow, action: ReviewAction, reason?: string) {
    void review.mutateAsync({ item, action, reason }).catch(() => undefined);
  }

  if (list.isPending) {
    return (
      <ul className={gridClass} aria-label="Loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReviewCardSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (list.isError) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" />}
        title="Could not load what is waiting"
        description={list.error.message}
        action={
          <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={<CheckCircle2 className="size-5" />} title={empty.title} description={empty.description} />;
  }

  return (
    <div>
      <AdminToolbar ruled={false} className="mt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:flex-1 xl:w-72 xl:flex-none">
            <Input
              type="search"
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              iconLeft={<Search className="size-4" />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="shrink-0">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOrder)}
              className="h-11 w-full rounded-sm border border-hairline-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-ink-subtle sm:w-auto"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </AdminToolbar>

      {review.isError && (
        <p role="alert" className="mt-5 text-sm text-danger-700">
          {review.error.message}
        </p>
      )}

      {(searching || items.length < total || flagged > 0) && (
        <p className="mt-5 text-sm text-ink-muted" data-numeric>
          {searching
            ? `Showing ${visible.length} of ${items.length}`
            : items.length < total
              ? `Showing the first ${items.length} of ${total}`
              : `${flagged} flagged for contact details in a description`}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Search className="size-5" />}
            title="Nothing matches"
            description="Try another name or title."
            action={
              <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        <ul className={`mt-6 ${gridClass}`}>
          {visible.map((item) => (
            <ReviewCard
              key={`${item.kind}-${item.id}`}
              item={item}
              pendingAction={
                review.isPending && review.variables?.item.id === item.id ? review.variables.action : null
              }
              disabled={review.isPending}
              onApprove={() => act(item, 'approve')}
              onReject={(reason) => act(item, 'reject', reason)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
