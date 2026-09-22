import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from './api';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();

  // Same reason as RequireAuth: null here is a blank screen for the length of
  // the session call, and the boot animation is already gone by then.
  if (isPending) return <RouteFallback chrome={false} slowAfterMs={8000} />;

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
