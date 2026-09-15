import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { queryClient } from '@/lib/query-client';
import { AdminProfilePage } from '@/pages/admin/AdminProfilePage';
import { AdminQueuePage } from '@/pages/admin/AdminQueuePage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { StyleGuidePage } from '@/pages/StyleGuidePage';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register/success" element={<RegisterSuccessPage />} />
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
