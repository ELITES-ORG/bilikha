/**
 * Runs the message files sweep once, as the API does every hour (ADR 0060):
 * deletes photos, audio and video past their 30 days, and tells both people in
 * a conversation when a file in it expires within three days.
 *
 * Nothing here is optional deletion — the 30 days are the policy, the API
 * already refuses to open an expired file, and it would delete the same
 * objects within the hour. This exists to run it now, or where the API is not
 * running.
 *
 * Usage:
 *   npm run messages:sweep
 */
import { closeDatabase } from '../db/index.js';
import { isStorageConfigured } from '../lib/storage.js';
import { deleteExpiredFiles, sendExpiryNotices } from '../modules/conversations/message-expiry.js';

async function main() {
  const now = new Date();
  if (isStorageConfigured()) {
    const deleted = await deleteExpiredFiles(now);
    console.log(`Expired message files deleted: ${deleted}`);
  } else {
    console.log('Storage is not configured; there are no message files to delete.');
  }

  const notices = await sendExpiryNotices(now);
  console.log(`Notices sent for files expiring within 3 days: ${notices}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
