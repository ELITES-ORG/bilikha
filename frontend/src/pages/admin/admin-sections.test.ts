import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, isAdminSectionActive } from './admin-sections';

/**
 * Plan 0022 step 4.2, the half that needs no browser. Which section is marked
 * is pure logic, and the `/admin` prefix trap is the specific bug the plan
 * warned about: every admin path starts with `/admin`, so a prefix match there
 * lights the review queue on every page.
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

  it('does not light the review queue on the other sections', () => {
    for (const path of ['/admin/media', '/admin/accounts', '/admin/ratings']) {
      expect(isAdminSectionActive(path, '/admin'), `queue lit on ${path}`).toBe(false);
    }
  });

  it('keeps the review queue lit on a profile detail', () => {
    const detail = '/admin/profiles/0f2c8f1e-1111-2222-3333-444455556666';

    expect(isAdminSectionActive(detail, '/admin')).toBe(true);

    const others = ADMIN_SECTIONS.filter(
      (s) => s.path !== '/admin' && isAdminSectionActive(detail, s.path),
    );
    expect(others).toEqual([]);
  });

  it('marks a section on its own sub-paths', () => {
    expect(isAdminSectionActive('/admin/media/anything', '/admin/media')).toBe(true);
  });

  it('does not match a section whose path is a string prefix of another', () => {
    // '/admin/account' must not light '/admin/accounts', and vice versa.
    expect(isAdminSectionActive('/admin/accountsomething', '/admin/accounts')).toBe(false);
  });
});
