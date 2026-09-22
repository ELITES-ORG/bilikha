import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * One identifier per build, baked into the bundle and written beside it.
 *
 * Vercel exports the commit SHA; locally there is none, so the timestamp does
 * the same job. The running app compares its baked-in copy against the file to
 * tell whether a deploy has happened since it loaded — see `lib/app-update.ts`.
 */
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? `local-${Date.now().toString(36)}`;

/**
 * Writes `build-id.txt` next to `index.html`. A few bytes, fetched with
 * `no-store` at most once an hour — cheap enough to justify on metered data.
 *
 * It must NOT live under `/assets/`: that path is immutable for a year and is
 * deliberately excluded from the SPA fallback, so a stamp there would be
 * unreadable and uncacheable in exactly the wrong directions.
 */
function buildIdFile(): Plugin {
  return {
    name: 'bilikha-build-id',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-id.txt', source: BUILD_ID });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), buildIdFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Proxying in dev keeps the browser on a single origin, so cookie-based
    // sessions behave the same locally as they will in production.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
