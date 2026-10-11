import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/catalogs/en';

/**
 * The privacy notice has to name every company that receives data (RA 10173).
 * Error reports have gone to Sentry since ADR 0053, and for a while the notice
 * still said nothing left the site but traffic to the hosts. If where reports go
 * changes, this notice changes with it, and so does this test.
 */
describe('privacy notice: who receives data', () => {
  it('names Sentry, what a report carries, and where it is stored', () => {
    const sharing = en['privacy.sharing.hostsRest'];

    expect(sharing).toContain('Sentry');
    expect(sharing).toContain('United States');
    expect(sharing).toContain('blanked');
  });

  it('does not claim that nothing goes to a third party', () => {
    expect(en['privacy.cookies.noTracking']).not.toMatch(/no third-party/i);
    expect(en['privacy.cookies.noTracking']).toContain('report of an error');
  });
});
