import type { AdminMediaRow } from '@contracts/admin';
import type { Paginated } from '@contracts/pagination';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ImageOff,
  Images,
  Inbox,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, toApiError } from '@/lib/api-client';
import { formatPriceRange } from '@/lib/money';
import {
  Badge,
  Button,
  Container,
  EmptyState,
  Input,
  ProgressiveImage,
  Skeleton,
  StatItem,
  Tabs,
} from '@/components/ui';
import {
  AdminFact,
  AdminPageHeader,
  AdminStatusBadge,
  AdminTabLabel,
  AdminToolbar,
  adminTabsClass,
} from './admin-ui';
import { formatAdminDate } from './admin-format';

type MediaKind = AdminMediaRow['kind'];
type KindFilter = 'all' | MediaKind;
/** `queue` is the server's own order: flagged offers first, then newest. */
type SortOrder = 'queue' | 'newest' | 'oldest';

type ListResponse = Paginated<AdminMediaRow>;

const KIND_LABEL: Record<MediaKind, string> = { avatar: 'Avatar', offer: 'Offer' };

const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'queue', label: 'Flagged first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

function useAdminMedia() {
  return useQuery({
    queryKey: ['admin', 'media'],
    queryFn: async (): Promise<ListResponse> => {
      try {
        const { data } = await apiClient.get<ListResponse>('/admin/media', {
          params: { page: 1, limit: 50 },
        });
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

function matchesSearch(item: AdminMediaRow, query: string): boolean {
  if (!query) return true;
  const haystack = [item.ownerName, item.title, item.caption, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function AdminMediaPage() {
  const queryClient = useQueryClient();
  const list = useAdminMedia();
  const [kind, setKind] = useState<KindFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('queue');

  const review = useMutation({
    mutationFn: async (input: {
      kind: MediaKind;
      id: string;
      action: 'approve' | 'remove';
    }) => {
      try {
        await apiClient.post(`/admin/media/${input.kind}/${input.id}/review`, {
          action: input.action,
        });
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'media'] });
    },
  });

  const items = useMemo(() => list.data?.data ?? [], [list.data]);
  const total = list.data?.meta.total ?? 0;
  // The split is only true when every waiting item is on this page.
  const complete = items.length === total;
  const counts = useMemo(
    () => ({
      avatar: items.filter((item) => item.kind === 'avatar').length,
      offer: items.filter((item) => item.kind === 'offer').length,
      flagged: items.filter((item) => item.flaggedAt).length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter(
      (item) => (kind === 'all' || item.kind === kind) && matchesSearch(item, needle),
    );
    if (sort === 'queue') return filtered;
    const direction = sort === 'newest' ? -1 : 1;
    return [...filtered].sort((a, b) =>
      a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -direction : direction,
    );
  }, [items, kind, query, sort]);

  function act(item: AdminMediaRow, action: 'approve' | 'remove') {
    void review.mutateAsync({ kind: item.kind, id: item.id, action }).catch(() => undefined);
  }

  const filtering = kind !== 'all' || query.trim() !== '';

  return (
    <Container width="wide" className="py-(--section-gap)">
      <AdminPageHeader
        title="Media review"
        description="Avatars and offer photos are live as soon as they are uploaded. Approve one to clear it from the queue, or remove it to take it down."
        aside={
          list.data &&
          total > 0 && (
            <dl className="flex divide-x divide-hairline">
              <StatItem value={total} label="Waiting" />
              {complete && (
                <>
                  <StatItem value={counts.avatar} label={counts.avatar === 1 ? 'Avatar' : 'Avatars'} />
                  <StatItem value={counts.offer} label={counts.offer === 1 ? 'Offer' : 'Offers'} />
                </>
              )}
              {counts.flagged > 0 && <StatItem value={counts.flagged} label="Flagged" />}
            </dl>
          )
        }
      />

      {list.data && items.length > 0 && (
        <AdminToolbar>
          {/* Search leads until the row fits beside the admin sidebar (xl); on a
              phone it is the quickest way to one item. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:order-last">
            <div className="sm:flex-1 xl:w-72 xl:flex-none">
              <Input
                type="search"
                aria-label="Search media"
                placeholder="Search by owner or offer"
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

          <Tabs
            label="Media type"
            idPrefix="media"
            className={adminTabsClass}
            value={kind}
            onChange={setKind}
            items={[
              { value: 'all' as const, label: <AdminTabLabel text="All" count={items.length} active={kind === 'all'} /> },
              { value: 'avatar' as const, label: <AdminTabLabel text="Avatars" count={counts.avatar} active={kind === 'avatar'} /> },
              { value: 'offer' as const, label: <AdminTabLabel text="Offers" count={counts.offer} active={kind === 'offer'} /> },
            ]}
          />
        </AdminToolbar>
      )}

      {review.isError && (
        <p role="alert" className="mt-5 text-sm text-danger-700">
          {review.error.message}
        </p>
      )}

      <div
        className="mt-8"
        {...(list.data && items.length > 0 && {
          id: `media-panel-${kind}`,
          role: 'tabpanel',
          'aria-labelledby': `media-tab-${kind}`,
        })}
      >
        {list.isPending && (
          <ul className={gridClass} aria-label="Loading media">
            {Array.from({ length: 6 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </ul>
        )}

        {list.isError && (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Could not load the media queue"
            description={list.error.message}
            action={
              <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {list.data && items.length === 0 && (
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title="Nothing to review"
            description="New avatars and offers will appear here."
          />
        )}

        {list.data && items.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No media matches"
            description="Try another name, or show every type."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setKind('all');
                }}
              >
                Clear search
              </Button>
            }
          />
        )}

        {visible.length > 0 && (
          <>
            {(filtering || !complete) && (
              <p className="mb-5 text-sm text-ink-muted" data-numeric>
                {filtering
                  ? `Showing ${visible.length} of ${items.length}`
                  : `Showing the first ${items.length} of ${total}`}
              </p>
            )}
            <ul className={gridClass}>
              {visible.map((item) => {
                const pendingAction =
                  review.isPending && review.variables?.id === item.id
                    ? review.variables.action
                    : null;
                return (
                  <MediaCard
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    pendingAction={pendingAction}
                    disabled={review.isPending}
                    onApprove={() => act(item, 'approve')}
                    onRemove={() => act(item, 'remove')}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}

/** One column on a phone, two from `sm`, three from `lg`. */
const gridClass = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6';

function NoPreview({ text }: { text: string }) {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2 text-ink-subtle">
      <ImageOff className="size-6" aria-hidden="true" />
      <span className="text-sm">{text}</span>
    </span>
  );
}

function MediaPreview({ item }: { item: AdminMediaRow }) {
  const images = item.kind === 'offer' ? (item.images ?? []) : [];
  const [cover, ...rest] = images;
  const alt = item.caption ?? item.title ?? `${KIND_LABEL[item.kind]} by ${item.ownerName}`;

  if (item.kind === 'offer') {
    if (!cover) return <NoPreview text="No photos on this offer" />;
    return (
      <>
        <ProgressiveImage
          src={cover.thumbUrl}
          alt={`Cover image for ${item.title ?? 'an offer'} by ${item.ownerName}`}
          width={400}
          height={300}
          className="size-full transition-transform duration-200 motion-safe:group-hover:scale-102"
          imageClassName="object-cover"
          fallback={<NoPreview text="No preview available" />}
        />
        {/* Every photo is under review, so the others show as a strip rather than hiding. */}
        {rest.length > 0 && (
          <ul className="absolute right-3 bottom-3 flex gap-1.5" aria-label="Other photos">
            {rest.slice(0, 3).map((image) => (
              <li key={image.id} className="size-11 overflow-hidden rounded-xs ring-2 ring-surface">
                <ProgressiveImage
                  src={image.thumbUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="size-full"
                  imageClassName="object-cover"
                  fallback={<span className="block size-full bg-surface-sunken" />}
                />
              </li>
            ))}
            {rest.length > 3 && (
              <li
                className="grid size-11 place-items-center rounded-xs bg-primary text-xs font-bold text-on-primary ring-2 ring-surface"
                data-numeric
              >
                +{rest.length - 3}
              </li>
            )}
          </ul>
        )}
      </>
    );
  }

  if (!item.thumbUrl) return <NoPreview text="No preview available" />;
  // Fills the frame like every other card, so a row of cards lines up; the
  // centre of a square avatar is what survives the crop.
  return (
    <ProgressiveImage
      src={item.thumbUrl}
      alt={alt}
      width={400}
      height={300}
      className="size-full transition-transform duration-200 motion-safe:group-hover:scale-102"
      imageClassName="object-cover"
      fallback={<NoPreview text="No preview available" />}
    />
  );
}

function MediaCard({
  item,
  pendingAction,
  disabled,
  onApprove,
  onRemove,
}: {
  item: AdminMediaRow;
  pendingAction: 'approve' | 'remove' | null;
  disabled: boolean;
  onApprove: () => void;
  onRemove: () => void;
}) {
  const isOffer = item.kind === 'offer';
  const hasPrice = item.priceMinCentavos != null || item.priceMaxCentavos != null || item.title;

  return (
    <li className="group flex flex-col overflow-hidden rounded-md border border-hairline bg-surface transition-[border-color,box-shadow] duration-200 hover:border-hairline-strong hover:shadow-sm">
      <div className="relative aspect-4/3 overflow-hidden bg-surface-sunken">
        <MediaPreview item={item} />
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <Badge
            tone="brand"
            variant="solid"
            icon={
              isOffer ? (
                <Images className="size-3.5" aria-hidden="true" />
              ) : (
                <UserRound className="size-3.5" aria-hidden="true" />
              )
            }
          >
            {KIND_LABEL[item.kind]}
          </Badge>
          {item.flaggedAt && (
            <AdminStatusBadge status="flagged" />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {isOffer && (
          <div className="mb-4">
            {item.title && (
              <h2 className="text-lg font-semibold break-words text-ink">{item.title}</h2>
            )}
            {hasPrice && (
              <p className="mt-1 font-bold text-ink" data-numeric>
                {formatPriceRange(item.priceMinCentavos ?? null, item.priceMaxCentavos ?? null)}
              </p>
            )}
            {item.description && (
              <p className="mt-2 line-clamp-2 text-sm text-pretty text-ink-muted">
                {item.description}
              </p>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-4">
          <AdminFact term="Owner">{item.ownerName}</AdminFact>
          <AdminFact term="Submitted">
            <time dateTime={item.createdAt}>{formatAdminDate(item.createdAt)}</time>
          </AdminFact>
        </dl>

        {item.profileSlug && (
          <Link
            to={`/creatives/${item.profileSlug}`}
            className="u-tap mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-ink underline-offset-4 hover:underline"
          >
            View profile
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-4">
        <Button
          size="md"
          iconLeft={<Check className="size-4" aria-hidden="true" />}
          loading={pendingAction === 'approve'}
          disabled={disabled}
          onClick={onApprove}
        >
          Approve
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="text-danger-700 hover:bg-danger-50 hover:text-danger-700"
          iconLeft={<Trash2 className="size-4" aria-hidden="true" />}
          loading={pendingAction === 'remove'}
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

function MediaCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-md border border-hairline bg-surface" aria-hidden="true">
      <Skeleton radius="xs" className="aspect-4/3 w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      </div>
      <div className="flex justify-between border-t border-hairline px-5 py-4">
        <Skeleton className="h-11 w-28" />
        <Skeleton className="h-11 w-24" />
      </div>
    </li>
  );
}
