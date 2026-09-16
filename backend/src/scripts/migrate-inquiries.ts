/**
 * Historical backfill for plan 0006 Phase 2.
 *
 * The `inquiries` table was dropped in Phase 8 after the conversation model
 * was verified. This script is retained only so the package script name still
 * resolves with a clear explanation.
 *
 *   npm --prefix backend run migrate:inquiries
 */
console.error(
  'migrate:inquiries is retired — the inquiries table was dropped after migration to conversations (plan 0006 Phase 8).',
);
process.exit(1);
