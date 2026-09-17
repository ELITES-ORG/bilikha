import { defineConfig } from 'vitest/config';

/**
 * Tests run against a real Postgres (ADR 0031), so the database URL is decided
 * here, before any module loads — `src/db/index.ts` builds its pool at import
 * time from `env.DATABASE_URL`, and nothing in the application reads a
 * test-specific variable.
 *
 * `TEST_DATABASE_URL` wins if set. Otherwise the development URL is reused with
 * the database name swapped, so a normal checkout needs no extra configuration.
 */
function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;

  const dev = process.env.DATABASE_URL ?? 'postgres://bilikha:bilikha@localhost:5432/bilikha';
  return dev.replace(/\/[^/?]+(\?|$)/, '/bilikha_test$1');
}

/**
 * Assigned here, in the config process, not only in `test.env`: globalSetup
 * runs before the test environment exists, so it reads this from the inherited
 * process environment.
 */
const DATABASE_URL = testDatabaseUrl();
process.env.DATABASE_URL = DATABASE_URL;

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    // One database, shared. Parallel files would truncate each other's rows
    // mid-test, so the isolation strategy and this setting are one decision.
    fileParallelism: false,
    globalSetup: ['./src/test/global-setup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL,
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
      LOG_LEVEL: 'fatal',
    },
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
