/**
 * The name of the unique index a write broke, or null if it broke none.
 *
 * Two requests can pass the same "is this free?" read and both write: two
 * foundings with one name, a double-clicked accept, two co-founders inviting
 * one person at once. The indexes keep the data right either way, but an
 * unhandled 23505 reaches the reader as a 500 and the error tracker as a bug.
 * The callers turn the one they expect into the answer the read would have
 * given. Walks `cause`, because Drizzle wraps the driver's error.
 */
export function brokenUniqueIndex(error: unknown): string | null {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const candidate = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (candidate.code === '23505') return candidate.constraint_name ?? '';
    current = candidate.cause;
  }
  return null;
}
