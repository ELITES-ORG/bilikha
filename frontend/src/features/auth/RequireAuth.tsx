import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from './api';
import { guardRedirect } from './guard-redirect';

export { CHANGE_PASSWORD_PATH } from './guard-redirect';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isPlaceholderData } = useCurrentUser();
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
   * An administrator reset this password (ADR 0051), or the account still owes
   * its ID (ADR 0057). The API refuses what either blocks, so without this the
   * person would walk into a 403 on whatever they tapped and have no idea why.
   * The guard on the server is what enforces it; this is what explains it.
   * `guardRedirect` decides which comes first.
   */
  const redirect = guardRedirect(user, location.pathname, isPlaceholderData);
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
