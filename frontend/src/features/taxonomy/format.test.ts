import { describe, expect, it } from 'vitest';
import { subdomainLabel } from './format';

describe('subdomainLabel', () => {
  it('uses the singular label when there is one', () => {
    expect(subdomainLabel({ name: 'Mobile App Developers', singularName: 'Mobile App Developer' }))
      .toBe('Mobile App Developer');
  });

  it('falls back to the plural name when an older API omits it', () => {
    expect(subdomainLabel({ name: 'Mobile App Developers' })).toBe('Mobile App Developers');
  });

  it('falls back to the plural name on null', () => {
    expect(subdomainLabel({ name: 'Photographers', singularName: null })).toBe('Photographers');
  });

  it('falls back to the plural name on a blank label', () => {
    expect(subdomainLabel({ name: 'Photographers', singularName: '   ' })).toBe('Photographers');
  });

  it('trims the singular label', () => {
    expect(subdomainLabel({ name: 'Photographers', singularName: '  Photographer ' }))
      .toBe('Photographer');
  });
});
