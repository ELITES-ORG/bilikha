import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from './api';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();
  const location = useLocation();

  // Not a redirect while resolving — that would bounce a signed-in user to
  // /login on every refresh. Not nothing either: this used to return null, and
  // on a cold API that is a blank screen for as long as the wait lasts, with
  // the boot animation already gone because React has mounted.
  if (isPending) return <RouteFallback chrome={false} slowAfterMs={8000} />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
