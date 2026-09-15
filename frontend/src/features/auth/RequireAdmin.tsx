import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from './api';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return null;

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
