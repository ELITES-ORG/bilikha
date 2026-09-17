import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CircleCheck,
  Clock3,
  Hammer,
  Handshake,
  Hourglass,
  Layers,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatPesos } from '@/lib/money';
import { cn } from '@/lib/cn';
import { scheduleLine, stateTone } from './format';
import type { AgreementState, MessageAgreement } from './types';

const STATE_ICONS: Record<AgreementState, ReactNode> = {
  'Awaiting response': <Clock3 className="size-3" aria-hidden />,
  Agreed: <Handshake className="size-3" aria-hidden />,
  'In progress': <Hammer className="size-3" aria-hidden />,
  'Awaiting confirmation': <Hourglass className="size-3" aria-hidden />,
  Completed: <CircleCheck className="size-3" aria-hidden />,
  Cancelled: <Ban className="size-3" aria-hidden />,
  Superseded: <Layers className="size-3" aria-hidden />,
  Withdrawn: <X className="size-3" aria-hidden />,
};

/** Colour alone fails for a colour vision deficiency, so every chip has an icon. */
export function AgreementStateChip({
  state,
  className,
}: {
  state: AgreementState;
  className?: string;
}) {
  return (
    <Badge tone={stateTone(state)} icon={STATE_ICONS[state]} className={className}>
      {state}
    </Badge>
  );
}

interface AgreementCardProps {
  agreement: MessageAgreement;
  /** Visual tone when nested in a self/other message bubble. */
  tone?: 'default' | 'onPrimary' | 'onSurface';
  className?: string;
  footer?: ReactNode;
}

/**
 * The thread card. It carries the headline facts and links to the record —
 * there is no second full-agreement view in the thread, because two renderings
 * of one document drift apart (ADR 0029).
 */
export function AgreementCard({
  agreement,
  tone = 'default',
  className,
  footer,
}: AgreementCardProps) {
  const onPrimary = tone === 'onPrimary';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-sm border',
        onPrimary && 'border-primary/40 bg-primary-active/40',
        tone === 'onSurface' && 'border-hairline bg-clay-50',
        tone === 'default' && 'border-hairline bg-surface',
        className,
      )}
    >
      <Link to={`/agreements/${agreement.id}`} className="block p-2 transition-opacity hover:opacity-90">
        <p
          className={cn(
            'text-2xs uppercase tracking-wide',
            onPrimary ? 'text-on-primary-muted' : 'text-ink-subtle',
          )}
        >
          Work agreement{agreement.version > 1 ? ` · version ${agreement.version}` : ''}
        </p>
        <p
          className={cn(
            'mt-0.5 truncate text-sm font-medium',
            onPrimary ? 'text-on-primary' : 'text-ink',
          )}
        >
          {agreement.packageTitle}
        </p>
        <p className={cn('mt-0.5 text-xs', onPrimary ? 'text-on-primary-muted' : 'text-ink-muted')}>
          {formatPesos(agreement.totalCentavos)} · {scheduleLine(agreement.startDate, agreement.endDate)}
        </p>
        <div className="mt-1.5">
          <AgreementStateChip state={agreement.state} />
        </div>
      </Link>
      {footer}
    </div>
  );
}

export function AgreementUnavailableNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-ink-muted', className)}>
      This work agreement is no longer available
    </p>
  );
}

/** Renders a message's agreement attachment, or the unavailable notice. */
export function MessageAgreementBlock({
  agreement,
  agreementRemoved,
  fromSelf,
}: {
  agreement: MessageAgreement | null;
  agreementRemoved?: boolean;
  fromSelf: boolean;
}) {
  if (agreement) {
    return (
      <div className="mb-2">
        <AgreementCard agreement={agreement} tone={fromSelf ? 'onPrimary' : 'onSurface'} />
      </div>
    );
  }
  if (agreementRemoved) {
    return (
      <div className="mb-2">
        <AgreementUnavailableNotice className={fromSelf ? 'text-on-primary-muted' : undefined} />
      </div>
    );
  }
  return null;
}
