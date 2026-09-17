import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Creatives live as a Directory segment (`?view=creatives`) so offers and people
 * share one browse surface. This route keeps old links working.
 */
export function CreativesPage() {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('view', 'creatives');
  const search = next.toString();
  return <Navigate to={{ pathname: '/directory', search: search ? `?${search}` : '' }} replace />;
}
