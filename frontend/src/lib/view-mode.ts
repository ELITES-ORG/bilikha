import type { ViewMode } from '@/features/auth/types';

/** Hiring is the only side without a creative profile. */
export function effectiveViewMode(
  user: { profileSlug: string | null; viewMode?: ViewMode } | null | undefined,
): ViewMode {
  if (!user?.profileSlug) return 'hiring';
  return user.viewMode ?? 'hiring';
}

/** The words a person sees. ADR 0038: the role, not the activity. */
export const MODE_LABEL: Record<ViewMode, string> = {
  hiring: 'Client mode',
  creative: 'Creative mode',
};

/** For a sentence: "Viewing as a client". */
export const MODE_AS: Record<ViewMode, string> = {
  hiring: 'a client',
  creative: 'a creative',
};
