import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Pure logic only — money formatting, relative time, derivations. No jsdom, no
 * Testing Library, no render assertions: ADR 0031 explains why page rendering
 * is not tested here.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});
