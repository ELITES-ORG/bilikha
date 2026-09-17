import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

/**
 * Runs once, before any test file. Creates the test database if it is missing,
 * migrates it, and loads the reference seed.
 *
 * It fails loudly rather than subtly: a contributor with the container stopped
 * should be told to start it, not handed two hundred failing assertions that
 * look like broken code.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL was not set by vitest.config.ts.');

  const name = new URL(url).pathname.slice(1);

  // Plan 0019 rule 4. Truncating the development database by accident has to be
  // impossible, not merely unlikely — so this refuses before anything connects
  // to it, let alone deletes from it.
  if (name !== 'bilikha_test') {
    throw new Error(
      `Refusing to run tests against "${name}". Tests truncate between cases, and only `
        + '"bilikha_test" is expendable. Set TEST_DATABASE_URL to a database with that name.',
    );
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  let admin: postgres.Sql;
  try {
    admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
    await admin`select 1`;
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres at ${adminUrl.host}. Run "npm run db:up" and try again.\n`
        + `Original error: ${(error as Error).message}`,
    );
  }

  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) {
      // Identifier, not a value, so it cannot be parameterised. `name` is
      // pinned to the literal above, so there is nothing here to inject.
      await admin.unsafe(`create database "${name}"`);
    }
  } finally {
    await admin.end();
  }

  // Migrations and the seed are separate processes so they pick up
  // DATABASE_URL from the environment and build their own pools — running them
  // in-process would import the application's pool against the wrong database.
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  const run = (script: string) => {
    try {
      execFileSync('npm', ['run', script], { cwd: process.cwd(), env, stdio: 'pipe', shell: true });
    } catch (error) {
      // execFileSync's message is just the command. What is needed is the
      // script's own stderr, which is where the actual reason is.
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      throw new Error(`"npm run ${script}" failed while preparing the test database.
${stderr}`);
    }
  };

  run('db:migrate');
  run('db:seed');
}
