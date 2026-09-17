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
const SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';

process.env.DATABASE_URL = DATABASE_URL;
// globalSetup shells out to db:migrate and db:seed, which validate the whole
// env schema. A developer machine has backend/.env to satisfy that; CI has
// nothing, so the required values are set here or the seed fails there only.
process.env.SESSION_SECRET = SESSION_SECRET;
process.env.NODE_ENV = 'test';

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
      SESSION_SECRET,
      LOG_LEVEL: 'fatal',
    },
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
