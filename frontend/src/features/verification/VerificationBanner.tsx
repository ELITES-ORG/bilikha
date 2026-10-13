import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BadgeCheck, CircleAlert, Clock3, IdCard, X } from 'lucide-react';
import { Badge, Container } from '@/components/ui';
import { useCurrentUser } from '@/features/auth/api';
import { useI18n, type ResolvedMessage } from '@/i18n/i18n-context';
import {
  ID_STEP_PATH,
  needsIdStep,
  readVerifiedSeen,
  rememberVerifiedSeen,
  showVerifiedNotice,
  verifiedNoticeKey,
} from './status';

/**
 * Where an account stands on its ID (ADR 0057), pinned on every page by
 * `PinnedBanners`. While the ID is not yet verified it cannot be dismissed: the
 * account can only browse until this goes away, and every page should say so.
 *
 * Once verified, it says so for a week, until closed: the "being verified"
 * strip would otherwise just vanish, and a person who was waiting, or who
 * appealed, should be told plainly that they are in.
 *
 * No verification at all — every account that existed before this shipped —
 * shows nothing.
 */
export function VerificationBanner() {
  const { data: user } = useCurrentUser();
  const { message } = useI18n();
  const { pathname } = useLocation();
  // The notice closed on this device, if any (a convenience; see status.ts).
  const [seen, setSeen] = useState<string | null>(readVerifiedSeen);
  const verification = user?.idVerification;

  if (!verification) return null;

  if (showVerifiedNotice(user, seen)) {
    const key = verifiedNoticeKey(user)!;
    return (
      <Strip
        tone="success"
        icon={<BadgeCheck className="size-4" aria-hidden="true" />}
        label={message('verification.banner.verified.label')}
        text={message('verification.banner.verified.message')}
        dismiss={{
          label: message('verification.banner.verified.dismiss'),
          onDismiss: () => {
            rememberVerifiedSeen(key);
            setSeen(key);
          },
        }}
      />
    );
  }

  // On the ID step itself, the page is the explanation.
  if (pathname === ID_STEP_PATH && needsIdStep(user)) return null;

  if (verification.status === 'pending' && !verification.submitted) {
    return (
      <Strip
        tone="warning"
        icon={<IdCard className="size-4" aria-hidden="true" />}
        label={message('verification.banner.missing.label')}
        text={message('verification.banner.missing.message')}
        action={
          <Link to={ID_STEP_PATH} className="link-underline font-medium">
            <Copy message={message('verification.banner.missing.action')} />
          </Link>
        }
      />
    );
  }

  if (verification.status === 'pending') {
    return (
      <Strip
        tone="warning"
        icon={<Clock3 className="size-4" aria-hidden="true" />}
        label={message('verification.banner.review.label')}
        text={message('verification.banner.review.message')}
      />
    );
  }

  if (verification.status === 'declined_retry') {
    return (
      <Strip
        tone="danger"
        icon={<CircleAlert className="size-4" aria-hidden="true" />}
        label={message('verification.banner.retry.label')}
        text={message('verification.banner.retry.message')}
        // The reason itself is on the ID step, in full, one tap away: pinned on
        // every page, a long one would take half a phone screen.
        action={
          <Link to={ID_STEP_PATH} className="link-underline font-medium">
            <Copy message={message('verification.banner.retry.action')} />
          </Link>
        }
      />
    );
  }

  return null;
}

function Copy({ message }: { message: ResolvedMessage }) {
  return <span lang={message.lang}>{message.text}</span>;
}

function Strip({
  tone,
  icon,
  label,
  text,
  action,
  dismiss,
}: {
  tone: 'warning' | 'danger' | 'success';
  icon: ReactNode;
  label: ResolvedMessage;
  text: ResolvedMessage;
  action?: ReactNode;
  /** Only the verified notice can be closed: the others are the account's state. */
  dismiss?: { label: ResolvedMessage; onDismiss: () => void };
}) {
  const surfaces = {
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    success: 'border-success-100 bg-success-50 text-success-700',
  } as const;

  return (
    <div role="status" className={`border-b ${surfaces[tone]}`}>
      <Container width="wide" className="flex items-start gap-3 py-2.5">
        <Badge tone={tone} icon={icon}>
          <Copy message={label} />
        </Badge>
        <div className="min-w-0 flex-1 text-sm text-pretty">
          <p>
            <Copy message={text} />
          </p>
          {action && <p className="mt-1">{action}</p>}
        </div>
        {dismiss && (
          <button
            type="button"
            onClick={dismiss.onDismiss}
            aria-label={dismiss.label.text}
            lang={dismiss.label.lang}
            className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-success-100"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </Container>
    </div>
  );
}
