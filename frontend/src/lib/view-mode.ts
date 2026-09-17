import type { ViewMode } from '@/features/auth/types';

/** Hiring is the only side without a creative profile. */
export function effectiveViewMode(
  user: { profileSlug: string | null; viewMode?: ViewMode } | null | undefined,
): ViewMode {
  if (!user?.profileSlug) return 'hiring';
  return user.viewMode ?? 'hiring';
}
