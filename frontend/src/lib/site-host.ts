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

export type DeploymentEnvironment = 'production' | 'staging' | 'local';

/**
 * The environment an error report is filed under (ADR 0053). Same rule as the
 * banner: production is matched exactly, so a preview can never file as
 * production. Previews count as staging — they call the staging API.
 */
export function deploymentEnvironment(hostname: string): DeploymentEnvironment {
  if (isProductionHost(hostname)) return 'production';
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return 'local';
  return 'staging';
}
