import { AlertCircle, Ban, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { Message } from '@/i18n/Message';
import { STATUS_LABEL } from './labels';
import type { OrganizationStatus } from './types';

const TONE = {
  pending_review: 'warning',
  published: 'success',
  rejected: 'danger',
  suspended: 'danger',
} as const;

const ICON = {
  pending_review: Clock,
  published: CheckCircle2,
  rejected: AlertCircle,
  suspended: Ban,
};

/** The page's review status, as the team sees it. Icon and colour together. */
export function OrganizationStatusBadge({ status }: { status: OrganizationStatus }) {
  const Icon = ICON[status];
  return (
    <Badge tone={TONE[status]} icon={<Icon className="size-3.5" aria-hidden="true" />}>
      <Message k={STATUS_LABEL[status]} />
    </Badge>
  );
}
