import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';
import { SwitchModeAction } from '@/components/SwitchModeAction';
import { useCurrentUser } from '@/features/auth/api';

interface ModeAwareEmptyStateProps {
  title: string;
  /**
   * Copy when the account has a creative profile (and the switch button).
   * Names what would fill the list — not the mode (ModeNotice) and not the
   * destination (SwitchModeAction).
   */
  description: string;
  /**
   * Copy when there is no creative profile. Same job as `description`, and
   * must not mention Creative mode — they cannot enter it. Selected by the
   * same `profileSlug` check as the button (plan 0032).
   */
  descriptionWithoutProfile?: string;
  extraAction?: ReactNode;
}

/**
 * Empty lists on mirrored surfaces. One `profileSlug` check gates both the
 * way-out button and which description is shown, so the copy and the control
 * cannot disagree (ADR 0025 / plan 0032).
 */
export function ModeAwareEmptyState({
  title,
  description,
  descriptionWithoutProfile,
  extraAction,
}: ModeAwareEmptyStateProps) {
  const { data: user } = useCurrentUser();
  const hasProfile = Boolean(user?.profileSlug);
  const text = hasProfile
    ? description
    : (descriptionWithoutProfile ?? description);

  return (
    <EmptyState
      title={title}
      description={text}
      action={
        <div className="flex flex-col items-center gap-4">
          {hasProfile && <SwitchModeAction />}
          {extraAction}
        </div>
      }
    />
  );
}
