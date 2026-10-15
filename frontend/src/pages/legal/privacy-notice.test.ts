import { describe, expect, it } from 'vitest';
import { enLegal } from '@/i18n/catalogs/legal/en';
import { enVerification } from '@/i18n/catalogs/verification/en';

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

/**
 * The ID photo (ADR 0057, plan 0053 Step 5.3): sensitive personal information,
 * so the notice says what it is, who sees it and how long it is kept, in the
 * same words the person agreed to on the ID step.
 */
describe('privacy notice: the photo of your ID', () => {
  const section = Object.entries(enLegal)
    .filter(([key]) => key.startsWith('privacy.id.'))
    .map(([, text]) => text)
    .join(' ');

  it('says how long it is kept in the words agreed to on the ID step', () => {
    expect(enVerification['idStep.consent.text']).toContain(enLegal['privacy.id.retention']);
  });

  it('promises on the ID step only what a repeated ID does: an administrator is told', () => {
    // review.service.ts warns about a matching ID number; it does not refuse
    // the registration. Consent to a promise the code does not keep is not
    // informed consent.
    const consent = enVerification['idStep.consent.text'];
    expect(consent).not.toMatch(/cannot be used to register/i);
    expect(consent).toContain('an administrator is told');
    expect(enLegal['privacy.id.code']).toContain('the administrator is told');
  });

  it('names it as sensitive personal information, and says what stays', () => {
    expect(section).toContain('Data Privacy Act');
    expect(section).toContain('sensitive personal information');
    expect(section).toContain('We do not keep the number');
    expect(section).toContain('scrambled code');
    expect(section).toContain('ask once');
  });

  it('is written for the people who sign up, not in technical terms', () => {
    // Who stores data for us is named once, under "Who else can see your
    // data"; this section says what happens, in everyday words.
    for (const word of ['Supabase', 'hash', 'storage', 'link', 'RA 10173', 'controller', 'one-way']) {
      expect(section, word).not.toContain(word);
    }
  });

  it('is named where data is held, never published, and seen by administrators', () => {
    expect(enLegal['privacy.collect.idAfter']).toContain('The photo of your ID');
    expect(enLegal['privacy.never.idLead']).toContain('ID');
    expect(enLegal['privacy.sharing.adminsRest']).toContain('photo of your ID');
    expect(enLegal['privacy.retention.body']).toContain('photo of your ID');
  });

  it('tells the terms that Bilikha is for people from Biliran', () => {
    expect(enLegal['terms.who.id']).toContain('people from Biliran');
  });
});
