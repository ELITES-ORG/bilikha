import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, CircleAlert, FilePenLine } from 'lucide-react';
import { useCurrentUser } from './api';
import { Badge, Container } from '@/components/ui';

export function RegistrationStatusBanner() {
  const { data: user } = useCurrentUser();

  if (!user || user.profileStatus === 'published' || !user.profileStatus) {
    return null;
  }

  if (user.profileStatus === 'pending_review') {
    return (
      <Banner
        tone="warning"
        icon={<Clock3 className="size-4" aria-hidden="true" />}
        label="Under review"
        message="Your creative profile is being reviewed, so it is not in the directory yet. Everything else works — you can browse, post work and message people."
      />
    );
  }

  if (user.profileStatus === 'suspended' && user.rejectionReason) {
    return (
      <Banner
        tone="danger"
        icon={<CircleAlert className="size-4" aria-hidden="true" />}
        label="Not approved"
        message={`Your creative profile was not approved. ${user.rejectionReason}`}
        action={
          // Straight to the editor, not the hub: the label promises editing,
          // and /account stopped carrying a form when it became a hub.
          <Link to="/account/profile" className="link-underline font-medium">
            Edit and resubmit
          </Link>
        }
      />
    );
  }

  if (user.profileStatus === 'draft') {
    return (
      <Banner
        tone="neutral"
        icon={<FilePenLine className="size-4" aria-hidden="true" />}
        label="Incomplete"
        message="Your creative profile is not finished, so it is not in the directory yet."
      />
    );
  }

  if (user.profileStatus === 'suspended') {
    return (
      <Banner
        tone="danger"
        icon={<CircleAlert className="size-4" aria-hidden="true" />}
        label="Suspended"
        message="Your creative profile was not approved, so it is not in the directory."
        action={
          // Straight to the editor, not the hub: the label promises editing,
          // and /account stopped carrying a form when it became a hub.
          <Link to="/account/profile" className="link-underline font-medium">
            Edit and resubmit
          </Link>
        }
      />
    );
  }

  return null;
}

function Banner({
  tone,
  icon,
  label,
  message,
  action,
}: {
  tone: 'warning' | 'danger' | 'neutral';
  icon: ReactNode;
  label: string;
  message: string;
  action?: ReactNode;
}) {
  const surfaces = {
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    neutral: 'border-hairline bg-clay-50 text-ink-muted',
  } as const;

  return (
    <div className={`border-b ${surfaces[tone]}`}>
      <Container width="wide" className="flex items-start gap-3 py-3">
        <Badge tone={tone} icon={icon}>
          {label}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-pretty">{message}</p>
          {action && <p className="mt-1 text-sm">{action}</p>}
        </div>
      </Container>
    </div>
  );
}
