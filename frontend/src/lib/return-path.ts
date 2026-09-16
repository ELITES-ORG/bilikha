/**
 * Same-origin relative return paths only. Rejects protocol-relative URLs
 * (`//evil.example`) and absolute URLs so `?next=` cannot open-redirect.
 */
export function safeReturnPath(
  value: string | null | undefined,
  fallback = '/',
): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;
  return value;
}

/** Append a validated `next` query param when one is present. */
export function withNextParam(path: string, next: string | null | undefined): string {
  const safe = next ? safeReturnPath(next, '') : '';
  if (!safe) return path;
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}next=${encodeURIComponent(safe)}`;
}
