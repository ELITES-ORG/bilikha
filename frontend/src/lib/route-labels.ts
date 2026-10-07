/** Section names, matched by path prefix; the first match wins. */
const LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['/directory', 'Directory'],
  ['/creatives', 'Creatives'],
  ['/register', 'Join the registry'],
  ['/login', 'Sign in'],
  ['/privacy', 'Privacy notice'],
  ['/terms', 'Terms of use'],
  ['/messages', 'Messages'],
  ['/notifications', 'Notifications'],
  ['/history', 'History'],
  ['/postings/mine', 'Your postings'],
  ['/account', 'Your account'],
  ['/admin', 'Admin'],
];

/** The name shown on the page transition for a link's destination. */
export function routeLabel(href: string): string {
  const pathname = href.split(/[?#]/)[0] || '/';
  if (pathname === '/') return 'Home';
  const match = LABELS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match[1] : 'Bilikha';
}
