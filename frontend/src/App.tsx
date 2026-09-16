import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '@/lib/query-client';
import { AdminProfilePage } from '@/pages/admin/AdminProfilePage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { AccountPage } from '@/pages/account/AccountPage';
import { CreativeProfilePage } from '@/pages/CreativeProfilePage';
import { ConversationPage } from '@/pages/ConversationPage';
import { DirectoryPage } from '@/pages/DirectoryPage';
import { HomePage } from '@/pages/HomePage';
import { InboxPage } from '@/pages/InboxPage';
import { LoginPage } from '@/pages/LoginPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { IntentPage } from '@/pages/onboarding/IntentPage';
import { ProfileSetupPage } from '@/pages/onboarding/ProfileSetupPage';
import { ProfileSubmittedPage } from '@/pages/onboarding/ProfileSubmittedPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { SentInquiriesPage } from '@/pages/SentInquiriesPage';
import { StyleGuidePage } from '@/pages/StyleGuidePage';
import { RequireAuth } from '@/features/auth/RequireAuth';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/directory" element={<DirectoryPage />} />
          <Route path="/creatives/:slug" element={<CreativeProfilePage />} />
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
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/inquiries" element={<SentInquiriesPage />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
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
          <Route path="/admin" element={<AdminQueuePage />} />
          <Route path="/admin/profiles/:id" element={<AdminProfilePage />} />
          {/* Internal design-system reference. Not linked from the product. */}
          <Route path="/styleguide" element={<StyleGuidePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
