import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { isStorageConfigured, projectRefFromUrl, storageKeyClaims } from './lib/storage.js';
import { closeDatabase } from './db/index.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Bilikha API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);

  // Loud, because the symptom otherwise is "images silently do nothing".
  if (!isStorageConfigured()) {
    logger.warn(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — avatar and offer images are disabled. Everything else works.',
    );
  } else {
    const { role, ref } = storageKeyClaims();
    const urlRef = projectRefFromUrl();

    if (role !== 'service_role') {
      logger.warn(
        { role: role ?? 'unknown' },
        'SUPABASE_SERVICE_ROLE_KEY does not carry the service_role claim — this is probably the anon key. Uploads will fail until it is replaced.',
      );
    }
    // A service_role key from another project decodes perfectly and fails only
    // at the first upload, as "signature verification failed". The ref claim
    // names the project the key was issued for, so the mismatch is visible here.
    if (ref && urlRef && ref !== urlRef) {
      logger.warn(
        { keyRef: ref, urlRef },
        'SUPABASE_SERVICE_ROLE_KEY was issued for a different Supabase project than SUPABASE_URL points at. Uploads will fail with "signature verification failed".',
      );
    }
  }
});

/**
 * Stop accepting new connections, let in-flight requests finish, then release
 * the Postgres pool. The 10s ceiling keeps a stuck request from blocking a
 * deploy indefinitely.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await closeDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
