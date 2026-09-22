import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from './api';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: user, isPending, isFetchedAfterMount } = useCurrentUser();

  /**
   * Deliberately stricter than `RequireAuth`.
   *
   * `useCurrentUser` seeds itself from a device-local hint so the app can paint
   * before the server answers, and for ordinary pages that is fine — a wrong
   * hint costs a redirect once the truth lands, and the server authorises every
   * request regardless. Admin is different: the hint is editable by whoever
   * holds the phone, and rendering the moderation shell on the strength of it
   * would show the shape of the admin tools to somebody who cannot use them.
   *
   * So this one waits for the answer from the server, every time. Admins are a
   * handful of people who visit rarely; a second of dots costs them nothing.
   */
  if (isPending || !isFetchedAfterMount) {
    return <RouteFallback chrome={false} slowAfterMs={8000} />;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
