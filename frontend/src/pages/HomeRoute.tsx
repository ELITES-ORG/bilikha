import { Navigate } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { useCurrentUser } from '@/features/auth/api';
import { HomePage } from '@/pages/HomePage';

/**
 * `/` means different things to the two audiences. Signed out it is the pitch —
 * the only page that explains what Bilikha is, which matters while the registry
 * is thin. Signed in it is a detour past the content they came for, so it sends
 * them to the directory (ADR 0023).
 *
 * The decision lives here rather than in the login redirect because everything
 * points at `/`: the logo, the 404's "Back to the registry", RequireAdmin's
 * bounce, and a login with no `?next=`. Fixing the route fixes all of them.
 *
 * Redirects rather than rendering the directory in place, so the URL matches
 * the page — otherwise the Home tab, which compares against `/directory`, never
 * shows as active.
 */
export function HomeRoute() {
  const { data: user, isPending } = useCurrentUser();

  // Not the landing page while resolving — that would flash the pitch at every
  // signed-in user on every visit to `/`. Not nothing either: this returned
  // null, and on a cold API that is a blank screen with no boot animation left
  // to cover it, which is exactly what it looked like from Biliran.
  if (isPending) return <RouteFallback chrome={false} slowAfterMs={8000} />;

  if (user) return <Navigate to="/directory" replace />;

  return <HomePage />;
}
