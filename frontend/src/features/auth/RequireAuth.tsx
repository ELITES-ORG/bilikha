import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from './api';

/** Kept here with the redirect that uses it, and matched in App.tsx. */
export const CHANGE_PASSWORD_PATH = '/change-password';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  // Not a redirect while resolving — that would bounce a signed-in user to
  // /login on every refresh. Not nothing either: this used to return null, and
  // on a cold API that is a blank screen for as long as the wait lasts, with
  // the boot animation already gone because React has mounted.
  if (isPending) return <RouteFallback slowAfterMs={8000} />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  /**
   * An administrator reset this password (ADR 0051). The API refuses every
   * route but reading the session and setting a new password, so without this
   * the person would walk into a 403 on whatever they tapped and have no idea
   * why. The guard on the server is what enforces it; this is what explains
   * it.
   */
  if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  return <>{children}</>;
}
