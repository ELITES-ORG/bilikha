/**
 * Route names and role words that must never become a username — the username
 * is the public profile segment, so `/creatives/admin` would otherwise be
 * claimable.
 */
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'superuser', 'staff', 'moderator', 'support',
  'help', 'api', 'auth', 'login', 'logout', 'register', 'signup', 'signin',
  'settings', 'account', 'profile', 'profiles', 'creatives', 'creative',
  'directory', 'domains', 'municipalities', 'barangays', 'search', 'about',
  'contact', 'privacy', 'terms', 'styleguide', 'dti', 'bilikha', 'official',
  'null', 'undefined', 'me', 'you', 'system',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isReservedUsername(raw: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(raw));
}
