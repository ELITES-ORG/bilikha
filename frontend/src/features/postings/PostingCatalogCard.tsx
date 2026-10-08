import { ArrowRight, BriefcaseBusiness, Check, Clock, MapPin, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, Skeleton } from '@/components/ui';
import type { Posting } from '@/features/postings/types';
import { formatBudgetRange } from '@/lib/money';
import { expiryTone, formatTimeLeft } from '@/lib/posting-time';

/**
 * One client posting in the creative's Directory. Postings carry no image, so
 * the card leads with a band naming the domain rather than a placeholder that
 * would look the same on every card. The whole card is one link to the
 * existing posting page.
 *
 * Nothing here has a fixed height: titles, client names and prices wrap, and
 * the location and deadline reflow onto two lines when the card is narrow.
 */
export function PostingCatalogCard({ posting }: { posting: Posting }) {
  const clientName = posting.client?.name ?? 'Client';
  // The same urgency rule as My postings: amber within a week, red under a day.
  const tone = expiryTone(posting.expiresAt);
  const replies = posting.replyCount ?? 0;

  return (
    <li>
      <Link
        to={`/postings/${posting.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-md border border-hairline bg-surface transition-[border-color,box-shadow] duration-200 hover:border-lawa-300 hover:shadow-sm"
      >
        <div className="flex items-center gap-2 bg-primary-soft px-4 py-3 sm:px-5">
          <BriefcaseBusiness className="size-4 shrink-0 text-lawa-700" aria-hidden="true" />
          <span className="min-w-0 text-xs font-semibold tracking-widest break-words text-lawa-700 uppercase">
            {posting.subdomain.domain}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <h2 className="u-display text-xl break-words text-ink transition-colors group-hover:text-lawa-700 sm:text-2xl">
            {posting.title}
          </h2>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="neutral" className="max-w-full bg-surface break-words whitespace-normal ring-hairline-strong">
              {posting.subdomain.name}
            </Badge>
            {posting.hasReplied && (
              <Badge tone="accent" icon={<Check className="size-3.5" aria-hidden="true" />}>
                Replied
              </Badge>
            )}
          </div>

          <p className="mt-3 text-md font-bold text-ink sm:text-lg" data-numeric>
            {formatBudgetRange(posting.budgetMinCentavos, posting.budgetMaxCentavos)}
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="break-words">{posting.municipality.name}</span>
            </p>
            <Badge tone={tone} icon={<Clock className="size-3.5" aria-hidden="true" />}>
              {formatTimeLeft(posting.expiresAt)}
            </Badge>
          </div>

          {/* mt-auto pins the client to the bottom, so footers line up across a row. */}
          <div className="mt-auto pt-4">
            <div className="flex items-center gap-3 border-t border-hairline pt-4">
              <Avatar src={posting.client?.avatarUrl} name={clientName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words text-ink">{clientName}</p>
                {/* How many creatives have replied, so far — one per thread, not per message. */}
                <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-muted" data-numeric>
                  <MessageSquare className="mt-px size-3 shrink-0" aria-hidden="true" />
                  {replies === 0
                    ? 'No replies to this posting yet'
                    : `${replies} ${replies === 1 ? 'reply' : 'replies'} to this posting`}
                </p>
              </div>
              <ArrowRight
                className="size-4 shrink-0 text-lawa-700 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** Same frame as the card, so the grid does not jump when the feed arrives. */
export function PostingCatalogCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-md border border-hairline bg-surface" aria-hidden="true">
      <div className="bg-primary-soft px-4 py-3 sm:px-5">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-36" />
        <div className="flex items-center gap-3 border-t border-hairline pt-4">
          <Skeleton radius="full" className="size-8" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Columns come from a minimum card width, not from breakpoints: a column is
 * added only when every card still gets 18rem. One on phones, two from about
 * 640px, three once the container fits three.
 */
export const postingGridClass =
  'grid gap-4 sm:gap-5 lg:gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]';
