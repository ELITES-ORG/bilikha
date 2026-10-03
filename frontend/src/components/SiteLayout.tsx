import { Suspense } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { RouteFallback } from '@/components/RouteFallback';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * The header for every product page, rendered once as a layout route.
 *
 * Each page used to render its own `<SiteHeader />`, so every navigation
 * unmounted one header and mounted another: the avatar reloaded, the unread
 * badges re-rendered from scratch, and anything the header held was lost on
 * each click. As the parent of those routes, this stays mounted while only the
 * page below it changes — the same way `BottomNav` already persists.
 *
 * Its own Suspense keeps the header up while a lazy page's chunk loads; the
 * one in App would otherwise replace the whole layout with its fallback.
 *
 * Not used by the landing page (its navy `brand` header and skip link are its
 * own), the auth and onboarding screens (no header), or the admin area (its
 * layout has its own header).
 */
export function SiteLayout() {
  // A conversation on a phone has its own chat bar in place of the header.
  const inConversation = useMatch('/messages/:id') !== null;

  return (
    <>
      <SiteHeader className={inConversation ? 'hidden sm:block' : undefined} />
      <Suspense fallback={<RouteFallback chrome={false} />}>
        <Outlet />
      </Suspense>
    </>
  );
}
