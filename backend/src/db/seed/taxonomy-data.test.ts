import { describe, expect, it } from 'vitest';
import { CREATIVE_DOMAINS } from './taxonomy-data.js';

const subdomains = CREATIVE_DOMAINS.flatMap((domain) => domain.subdomains);

function singularOf(slug: string): string | undefined {
  return subdomains.find((sub) => sub.slug === slug)?.singularName;
}

/**
 * Issue #17. Every sub-domain carries a curated singular label, written by a
 * person rather than derived from the plural, because the 81 names include
 * organisations, things and compounds.
 */
describe('seed taxonomy — singular labels', () => {
  it('has exactly 81 sub-domains', () => {
    expect(subdomains).toHaveLength(81);
  });

  it('gives every sub-domain a singular label of at least two characters', () => {
    for (const sub of subdomains) {
      expect(typeof sub.singularName, sub.slug).toBe('string');
      expect(sub.singularName.trim().length, sub.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('never leaves a singular label empty', () => {
    expect(subdomains.filter((sub) => sub.singularName === '')).toEqual([]);
  });

  it('uses the approved wording', () => {
    expect(singularOf('mobile-app-developers')).toBe('Mobile App Developer');
    expect(singularOf('indigenous-craft-artisans')).toBe('Artisan of Indigenous Crafts');
  });
});
