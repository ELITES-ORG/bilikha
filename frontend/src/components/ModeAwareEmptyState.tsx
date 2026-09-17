import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';
import { ModeSwitch } from '@/components/ModeSwitch';
import { useCurrentUser } from '@/features/auth/api';

interface ModeAwareEmptyStateProps {
  title: string;
  description: string;
  extraAction?: ReactNode;
}

/**
 * Empty lists on mirrored surfaces name the mode and offer ModeSwitch when the
 * account has a creative profile (plan 0013 rule 2).
 */
export function ModeAwareEmptyState({
  title,
  description,
  extraAction,
}: ModeAwareEmptyStateProps) {
  const { data: user } = useCurrentUser();
  const hasProfile = Boolean(user?.profileSlug);

  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <div className="flex flex-col items-center gap-4">
          {hasProfile && <ModeSwitch size="md" />}
          {extraAction}
        </div>
      }
    />
  );
}
