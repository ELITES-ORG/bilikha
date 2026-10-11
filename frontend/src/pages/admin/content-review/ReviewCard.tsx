import type { AdminMediaRow } from '@contracts/admin';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ImageOff, Images, UserRound, Users, X } from 'lucide-react';
import { Badge, Button, ProgressiveImage, Skeleton, Textarea } from '@/components/ui';
import { formatPriceRange } from '@/lib/money';
import { AdminFact, AdminStatusBadge } from '../admin-ui';
import { formatAdminDate } from '../admin-format';

/**
 * One item waiting for a decision (ADR 0058): what it is, what the public sees
 * now if anything, and Approve or Reject with a reason its owner sees. The same
 * card under every subject that reviews content — Offers, People's profile
 * photos, Organisations' logos (ADR 0059) — so a decision always looks the same.
 */

export type ReviewAction = 'approve' | 'reject';

type MediaKind = AdminMediaRow['kind'];

const KIND_LABEL: Record<MediaKind, string> = { avatar: 'Profile photo', offer: 'Offer', logo: 'Logo' };

/** What the card is: an offer is new, or a change to one already public. */
function cardLabel(item: AdminMediaRow): string {
  if (item.kind !== 'offer') return KIND_LABEL[item.kind];
  return item.change === 'edit' ? 'Offer changes' : 'New offer';
}

function NoPreview({ text }: { text: string }) {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2 text-ink-subtle">
      <ImageOff className="size-6" aria-hidden="true" />
      <span className="text-sm">{text}</span>
    </span>
  );
}

function MediaPreview({ item }: { item: AdminMediaRow }) {
  const images = item.kind === 'offer' ? (item.images ?? []).filter((image) => image.state !== 'pending_remove') : [];
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

/** For a change: what it does to the offer's photos, in a few words. */
function photoChanges(item: AdminMediaRow): string | null {
  const added = (item.images ?? []).filter((image) => image.state === 'pending_add').length;
  const removed = (item.images ?? []).filter((image) => image.state === 'pending_remove').length;
  const parts = [
    added ? `${added} photo${added === 1 ? '' : 's'} added` : null,
    removed ? `${removed} photo${removed === 1 ? '' : 's'} removed` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function ReviewCard({
  item,
  pendingAction,
  disabled,
  onApprove,
  onReject,
}: {
  item: AdminMediaRow;
  pendingAction: ReviewAction | null;
  disabled: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const isOffer = item.kind === 'offer';
  const hasPrice = item.priceMinCentavos != null || item.priceMaxCentavos != null || item.title;
  // Rejecting opens a reason box in place: its owner is shown what is written.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const published = item.published;
  const photos = isOffer && item.change === 'edit' ? photoChanges(item) : null;

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
              ) : item.kind === 'logo' ? (
                <Users className="size-3.5" aria-hidden="true" />
              ) : (
                <UserRound className="size-3.5" aria-hidden="true" />
              )
            }
          >
            {cardLabel(item)}
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
            {item.subdomain && <p className="mt-2 text-xs text-ink-subtle">{item.subdomain}</p>}
            {photos && <p className="mt-2 text-sm font-medium text-warning-700">{photos}</p>}
            {published && (
              <div className="mt-3 rounded-sm border border-hairline bg-surface-sunken px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">Public now</p>
                <p className="mt-1 text-sm break-words text-ink">{published.title}</p>
                <p className="text-sm text-ink-muted" data-numeric>
                  {formatPriceRange(published.priceMinCentavos, published.priceMaxCentavos)}
                  {published.subdomain !== item.subdomain ? ` · ${published.subdomain}` : ''}
                </p>
              </div>
            )}
          </div>
        )}

        {!isOffer && item.currentUrl && (
          <div className="mb-4 flex items-center gap-3">
            <img
              src={item.currentUrl}
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <p className="text-sm text-ink-muted">Replaces the approved one, which stays if you reject this.</p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-4">
          <AdminFact term={item.kind === 'logo' ? 'Organisation' : 'Owner'}>{item.ownerName}</AdminFact>
          <AdminFact term="Submitted">
            <time dateTime={item.createdAt}>{formatAdminDate(item.createdAt)}</time>
          </AdminFact>
        </dl>

        {item.kind === 'logo' && item.organizationSlug && (
          <Link
            to={`/organizations/${item.organizationSlug}`}
            className="u-tap mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-ink underline-offset-4 hover:underline"
          >
            View page
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        )}

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

      {rejecting ? (
        <form
          className="space-y-3 border-t border-hairline px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) onReject(reason.trim());
          }}
        >
          <Textarea
            id={`reject-reason-${item.kind}-${item.id}`}
            label="Why it is not approved"
            hint="Its owner sees this, so say what to change."
            rows={3}
            maxLength={500}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="md" disabled={disabled} onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              variant="danger"
              loading={pendingAction === 'reject'}
              disabled={disabled || !reason.trim()}
            >
              Reject
            </Button>
          </div>
        </form>
      ) : (
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
            iconLeft={<X className="size-4" aria-hidden="true" />}
            disabled={disabled}
            onClick={() => setRejecting(true)}
          >
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}

export function ReviewCardSkeleton() {
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
