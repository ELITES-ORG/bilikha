import { describe, expect, it } from 'vitest';
import { enLegal } from '@/i18n/catalogs/legal/en';

/**
 * The privacy notice has to name every company that receives data (RA 10173).
 * Error reports have gone to Sentry since ADR 0053, and for a while the notice
 * still said nothing left the site but traffic to the hosts. If where reports go
 * changes, this notice changes with it, and so does this test.
 */
describe('privacy notice: who receives data', () => {
  it('names Sentry, what a report carries, and where it is stored', () => {
    const sharing = enLegal['privacy.sharing.hostsRest'];

    expect(sharing).toContain('Sentry');
    expect(sharing).toContain('United States');
    expect(sharing).toContain('blanked');
    // 30 days on Sentry's free plan, 90 on every paid one, so "within 90 days"
    // stays true whichever plan Bilikha is on.
    expect(sharing).toContain('within 90 days');
  });

  it('says unmatched searches are counted, and not by whom (issue #24)', () => {
    const searches = enLegal['privacy.usage.searchesRest'];

    expect(searches).toContain('counted per day');
    expect(searches).toContain('90 days');
    expect(searches).toContain('nothing that says who searched');
  });

  it('does not claim that nothing goes to a third party', () => {
    expect(enLegal['privacy.cookies.noTracking']).not.toMatch(/no third-party/i);
    expect(enLegal['privacy.cookies.noTracking']).toContain('report of an error');
  });
});
