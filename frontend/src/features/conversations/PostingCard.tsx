import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatPriceRange } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { MessagePosting } from './types';

type PostingCardData = {
  id: string;
  title: string;
  budgetMinCentavos: number | null;
  budgetMaxCentavos: number | null;
  status?: MessagePosting['status'];
};

interface PostingCardProps {
  posting: PostingCardData;
  tone?: 'default' | 'onPrimary' | 'onSurface';
  className?: string;
  footer?: ReactNode;
}

export function PostingCard({ posting, tone = 'default', className, footer }: PostingCardProps) {
  const unavailable =
    posting.status === 'closed' || posting.status === 'expired';
  return (
    <div
      className={cn(
        'overflow-hidden rounded-sm border',
        tone === 'onPrimary' && 'border-primary/40 bg-primary-active/40',
        tone === 'onSurface' && 'border-hairline bg-clay-50',
        tone === 'default' && 'border-hairline bg-surface',
        className,
      )}
    >
      <Link
        to={`/postings/${posting.id}`}
        className={cn(
          'block p-2 transition-opacity',
          unavailable ? 'pointer-events-none opacity-80' : 'hover:opacity-90',
        )}
      >
        <p
          className={cn(
            'truncate text-sm font-medium',
            tone === 'onPrimary' ? 'text-on-primary' : 'text-ink',
          )}
        >
          {posting.title}
        </p>
        <p
          className={cn(
            'mt-0.5 text-xs',
            tone === 'onPrimary' ? 'text-on-primary-muted' : 'text-ink-muted',
          )}
        >
          {formatPriceRange(posting.budgetMinCentavos, posting.budgetMaxCentavos)}
        </p>
        {unavailable && (
          <p
            className={cn(
              'mt-1 text-xs',
              tone === 'onPrimary' ? 'text-on-primary-muted' : 'text-ink-subtle',
            )}
          >
            {posting.status === 'closed' ? 'Closed' : 'Expired'}
          </p>
        )}
      </Link>
      {footer}
    </div>
  );
}

export function PostingUnavailableNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-ink-muted', className)}>
      This posting is no longer available
    </p>
  );
}

export function MessagePostingBlock({
  posting,
  postingRemoved,
  fromSelf,
}: {
  posting: MessagePosting | null;
  postingRemoved?: boolean;
  fromSelf: boolean;
}) {
  if (posting) {
    return (
      <div className="mb-2">
        <PostingCard posting={posting} tone={fromSelf ? 'onPrimary' : 'onSurface'} />
      </div>
    );
  }
  if (postingRemoved) {
    return (
      <div className="mb-2">
        <PostingUnavailableNotice className={fromSelf ? 'text-on-primary-muted' : undefined} />
      </div>
    );
  }
  return null;
}
