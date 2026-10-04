/**
 * Which deployment this tab is running on, decided by hostname at runtime.
 *
 * Not a build flag or a `VITE_` variable: staging and production build the
 * same code, and a variable set wrongly on one Vercel project would put the
 * staging banner on the live site. The hostname cannot be misconfigured. It is
 * the same rule `vercel.json` uses to route `/api` and to send `noindex`.
 */
const PRODUCTION_HOST = 'bilikha.vercel.app';

export const PRODUCTION_ORIGIN = `https://${PRODUCTION_HOST}`;

export function isProductionHost(hostname: string): boolean {
  return hostname.toLowerCase() === PRODUCTION_HOST;
}
