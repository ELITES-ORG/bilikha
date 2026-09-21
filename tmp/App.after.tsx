import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { RouteFallback } from '@/components/RouteFallback';
import { ToastProvider } from '@/components/ui';
import { queryClient } from '@/lib/query-client';
import { RequireAdmin } from '@/features/auth/RequireAdmin';
import { RequireAuth } from '@/features/auth/RequireAuth';

/*
 * Eager: first paint and the common browse path (plan 0031 rule 3).
 * DirectoryPage stays eager — signed-in `/` redirects there, and splitting it
 * would add a round trip to the most common entry. Measured both ways in the
 * plan progress notes.
 */
/*
 * Eager: first paint and the common browse path (plan 0031 rule 3).
 * DirectoryPage stays eager — signed-in `/` redirects there, and splitting it
 * saves only ~3 KB gzip while adding a round trip to the most common entry.
 * Measured both ways: eager 302.41/88.13 gzip; lazy 287.03/85.14 gzip.
 */
import { HomeRoute } from '@/pages/HomeRoute';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { CreativesPage } from '@/pages/CreativesPage';
import { CreativeProfilePage } from '@/pages/CreativeProfilePage';
import { OfferDetailPage } from '@/pages/OfferDetailPage';
import { PostingDetailPage } from '@/pages/PostingDetailPage';
import { LoginPage } from '@/pages/LoginPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const AdminLayout = lazy(() =>
  import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminQueuePage = lazy(() =>
  import('@/pages/admin/AdminQueuePage').then((m) => ({ default: m.AdminQueuePage })),
);
const AdminMediaPage = lazy(() =>
  import('@/pages/admin/AdminMediaPage').then((m) => ({ default: m.AdminMediaPage })),
);
const AdminAccountsPage = lazy(() =>
  import('@/pages/admin/AdminAccountsPage').then((m) => ({ default: m.AdminAccountsPage })),
);
const AdminRatingsPage = lazy(() =>
  import('@/pages/admin/AdminRatingsPage').then((m) => ({ default: m.AdminRatingsPage })),
);
const AdminProfilePage = lazy(() =>
  import('@/pages/admin/AdminProfilePage').then((m) => ({ default: m.AdminProfilePage })),
);

const AccountPage = lazy(() =>
  import('@/pages/account/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const WorkPage = lazy(() =>
  import('@/pages/account/WorkPage').then((m) => ({ default: m.WorkPage })),
);
const OffersSettingsPage = lazy(() =>
  import('@/pages/account/OffersSettingsPage').then((m) => ({ default: m.OffersSettingsPage })),
);
const ProfileSettingsPage = lazy(() =>
  import('@/pages/account/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage })),
);
const SecuritySettingsPage = lazy(() =>
  import('@/pages/account/SecuritySettingsPage').then((m) => ({ default: m.SecuritySettingsPage })),
);

const AgreementPage = lazy(() =>
  import('@/pages/AgreementPage').then((m) => ({ default: m.AgreementPage })),
);
const ConversationPage = lazy(() =>
  import('@/pages/ConversationPage').then((m) => ({ default: m.ConversationPage })),
);
const HistoryPage = lazy(() =>
  import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const MyPostingsPage = lazy(() =>
  import('@/pages/MyPostingsPage').then((m) => ({ default: m.MyPostingsPage })),
);
const PostingComposePage = lazy(() =>
  import('@/pages/PostingComposePage').then((m) => ({ default: m.PostingComposePage })),
);
const RegisterPage = lazy(() =>
  import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const StyleGuidePage = lazy(() =>
  import('@/pages/StyleGuidePage').then((m) => ({ default: m.StyleGuidePage })),
);
const IntentPage = lazy(() =>
  import('@/pages/onboarding/IntentPage').then((m) => ({ default: m.IntentPage })),
);
const ProfileSetupPage = lazy(() =>
  import('@/pages/onboarding/ProfileSetupPage').then((m) => ({ default: m.ProfileSetupPage })),
);
const ProfileSubmittedPage = lazy(() =>
  import('@/pages/onboarding/ProfileSubmittedPage').then((m) => ({
    default: m.ProfileSubmittedPage,
  })),
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          {/*
            One Suspense high up so SiteHeader / BottomNav are not remounted on
            every navigation. Fallback is never null (plan 0031 rule 1).
          */}
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/creatives" element={<CreativesPage />} />
              <Route path="/creatives/:slug" element={<CreativeProfilePage />} />
              <Route path="/offers/:id" element={<OfferDetailPage />} />
              <Route
                path="/postings/new"
                element={
                  <RequireAuth>
                    <PostingComposePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/postings/mine"
                element={
                  <RequireAuth>
                    <MyPostingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/postings/:id/edit"
                element={
                  <RequireAuth>
                    <PostingComposePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/postings/:id"
                element={
                  <RequireAuth>
                    <PostingDetailPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/messages"
                element={
                  <RequireAuth>
                    <MessagesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/messages/:id"
                element={
                  <RequireAuth>
                    <ConversationPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/agreements/:id"
                element={
                  <RequireAuth>
                    <AgreementPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/history"
                element={
                  <RequireAuth>
                    <HistoryPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <NotificationsPage />
                  </RequireAuth>
                }
              />
              <Route path="/inbox" element={<Navigate to="/messages" replace />} />
              <Route path="/inquiries" element={<Navigate to="/messages" replace />} />
              <Route
                path="/account"
                element={
                  <RequireAuth>
                    <AccountPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account/work"
                element={
                  <RequireAuth>
                    <WorkPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account/profile"
                element={
                  <RequireAuth>
                    <ProfileSettingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account/offers"
                element={
                  <RequireAuth>
                    <OffersSettingsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/account/security"
                element={
                  <RequireAuth>
                    <SecuritySettingsPage />
                  </RequireAuth>
                }
              />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/welcome"
                element={
                  <RequireAuth>
                    <IntentPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/welcome/profile"
                element={
                  <RequireAuth>
                    <ProfileSetupPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/welcome/submitted"
                element={
                  <RequireAuth>
                    <ProfileSubmittedPage />
                  </RequireAuth>
                }
              />
              <Route path="/login" element={<LoginPage />} />
              {/*
                RequireAdmin wraps the lazy layout so a bounce never downloads
                the admin chunk.
              */}
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminLayout />
                  </RequireAdmin>
                }
              >
                <Route index element={<AdminQueuePage />} />
                <Route path="media" element={<AdminMediaPage />} />
                <Route path="accounts" element={<AdminAccountsPage />} />
                <Route path="ratings" element={<AdminRatingsPage />} />
                <Route path="profiles/:id" element={<AdminProfilePage />} />
              </Route>
              {/* Internal design-system reference. Not linked from the product. */}
              <Route path="/styleguide" element={<StyleGuidePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <BottomNav />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
