import type { AdminSummary } from '@contracts/admin';
import { describe, expect, it } from 'vitest';
import { ADMIN_GROUPS, ADMIN_HOME, ADMIN_SECTIONS, isAdminSectionActive } from './admin-sections';

/**
 * Plan 0022 step 4.2, the half that needs no browser, and the sections by
 * subject (ADR 0059). Which section is marked, and what its badge counts, is
 * pure logic.
 */
describe('which admin section is marked', () => {
  it('marks exactly one section on every section path', () => {
    for (const section of ADMIN_SECTIONS) {
      const marked = ADMIN_SECTIONS.filter((candidate) =>
        isAdminSectionActive(section.path, candidate.path),
      );

      expect(marked.map((m) => m.path), `on ${section.path}`).toEqual([section.path]);
    }
  });

  it('keeps Creatives marked on a profile detail, and nothing else', () => {
    const detail = '/admin/profiles/0f2c8f1e-1111-2222-3333-444455556666';

    expect(isAdminSectionActive(detail, ADMIN_HOME)).toBe(true);
    expect(ADMIN_SECTIONS.filter((s) => isAdminSectionActive(detail, s.path)).map((s) => s.path)).toEqual([
      ADMIN_HOME,
    ]);
  });

  it('keeps People marked on an ID review, and nothing else', () => {
    const review = '/admin/people/ids/0f2c8f1e-1111-2222-3333-444455556666';

    expect(ADMIN_SECTIONS.filter((s) => isAdminSectionActive(review, s.path)).map((s) => s.path)).toEqual([
      '/admin/people',
    ]);
  });

  it('marks a section on its own sub-paths', () => {
    expect(isAdminSectionActive('/admin/offers/anything', '/admin/offers')).toBe(true);
  });

  it('does not match a section whose path is a string prefix of another', () => {
    // '/admin/account' must not light '/admin/accounts', and vice versa.
    expect(isAdminSectionActive('/admin/accountsomething', '/admin/accounts')).toBe(false);
  });
});

describe('the sections by subject', () => {
  const summary: AdminSummary = {
    creatives: { pending: 2, edited: 1, covers: 4 },
    offers: { new: 3, changes: 4 },
    organizations: { pending: 1, edited: 2, logos: 5 },
    people: { photos: 6, ids: 2, appeals: 1 },
    reports: { open: 7 },
  };

  it('counts everything waiting under its subject: a cover with its creative, a logo with its organisation, a change with new offers, an ID and an appeal with photos', () => {
    const waiting = Object.fromEntries(
      ADMIN_SECTIONS.map((section) => [section.label, section.waiting ? section.waiting(summary) : null]),
    );

    expect(waiting).toEqual({
      Creatives: 7,
      Offers: 7,
      Organisations: 8,
      People: 9,
      Reports: 7,
      'Find an account': null,
      Taxonomy: null,
    });
  });

  it('still counts Creatives when an API from before covers sends no covers', () => {
    const creatives = ADMIN_SECTIONS.find((section) => section.label === 'Creatives')!;
    const older: AdminSummary = { ...summary, creatives: { pending: 2, edited: 1 } };

    expect(creatives.waiting!(older)).toBe(3);
  });

  it('still counts People when an API from before ID review sends no ids', () => {
    const people = ADMIN_SECTIONS.find((section) => section.label === 'People')!;
    const older: AdminSummary = { ...summary, people: { photos: 6 } };

    expect(people.waiting!(older)).toBe(6);
  });

  it('still counts People when an API from before appeals sends no appeals', () => {
    const people = ADMIN_SECTIONS.find((section) => section.label === 'People')!;
    const older: AdminSummary = { ...summary, people: { photos: 6, ids: 2 } };

    expect(people.waiting!(older)).toBe(8);
  });

  it('lists every section of work before the tools, and gives only the work a badge', () => {
    const groups = ADMIN_SECTIONS.map((section) => section.group);
    const firstTool = groups.indexOf('manage');

    expect(groups.slice(firstTool).every((group) => group === 'manage')).toBe(true);
    expect(new Set(groups)).toEqual(new Set(ADMIN_GROUPS.map((group) => group.id)));
    for (const section of ADMIN_SECTIONS) {
      expect(section.waiting === null, section.label).toBe(section.group === 'manage');
    }
  });
});
