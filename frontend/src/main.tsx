import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { clearReloadGuard } from '@/lib/app-update'
import { registerServiceWorker } from '@/lib/service-worker'
// Imported for its side effect, and it must be here rather than in the
// component that uses it: beforeinstallprompt fires once, early, and the
// account page that shows the Install button is a lazy chunk that mounts far
// too late to hear it.
import '@/lib/install-prompt-store'

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

// After render, never before: nothing here may delay first paint, and the kill
// switch has to run on every start whether or not a worker is registered.
void registerServiceWorker()
