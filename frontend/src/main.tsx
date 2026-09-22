import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { clearReloadGuard } from '@/lib/app-update'

// A render that got this far is a build that works, so the one-shot reload
// guard can be released. Outside React on purpose: it must run even if App
// itself is what throws (ADR 0040).
clearReloadGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
