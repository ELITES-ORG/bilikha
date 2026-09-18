import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ToastProvider } from '@/components/ui';
import { queryClient } from '@/lib/query-client';
import { AdminAccountsPage } from '@/pages/admin/AdminAccountsPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminMediaPage } from '@/pages/admin/AdminMediaPage';
import { AdminProfilePage } from '@/pages/admin/AdminProfilePage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { AdminRatingsPage } from '@/pages/admin/AdminRatingsPage';
import { AccountPage } from '@/pages/account/AccountPage';
import { AgreementPage } from '@/pages/AgreementPage';
import { OffersSettingsPage } from '@/pages/account/OffersSettingsPage';
import { ProfileSettingsPage } from '@/pages/account/ProfileSettingsPage';
import { SecuritySettingsPage } from '@/pages/account/SecuritySettingsPage';
import { CreativeProfilePage } from '@/pages/CreativeProfilePage';
import { CreativesPage } from '@/pages/CreativesPage';
import { ConversationPage } from '@/pages/ConversationPage';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { HomeRoute } from '@/pages/HomeRoute';
import { OfferDetailPage } from '@/pages/OfferDetailPage';
import { MyPostingsPage } from '@/pages/MyPostingsPage';
import { PostingComposePage } from '@/pages/PostingComposePage';
import { PostingDetailPage } from '@/pages/PostingDetailPage';
import { LoginPage } from '@/pages/LoginPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { IntentPage } from '@/pages/onboarding/IntentPage';
import { ProfileSetupPage } from '@/pages/onboarding/ProfileSetupPage';
import { ProfileSubmittedPage } from '@/pages/onboarding/ProfileSubmittedPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { StyleGuidePage } from '@/pages/StyleGuidePage';
import { RequireAuth } from '@/features/auth/RequireAuth';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
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
            <Route path="/register/success" element={<RegisterSuccessPage />} />
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
            <Route path="/admin" element={<AdminLayout />}>
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
          <BottomNav />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
