import { describe, expect, it } from 'vitest';
import { en } from './en';
import { enLegal } from './legal/en';

/**
 * A lazy route's keys may only be read where its section is loaded (ADR 0055).
 *
 * A component that reads a section key without the section registered renders
 * the key itself — "privacy.title" where the title should be. This fails the
 * build instead: each section names the one folder that loads it, and a key
 * read anywhere else is an error. A new lazy route adds its own line here.
 */
const SECTIONS = [
  { name: 'legal', keys: Object.keys(enLegal), home: '/src/pages/legal/' },
] as const;

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Application code only: tests quote keys freely, and the catalogues are where
// the keys are defined.
const code = Object.entries(sources).filter(
  ([path]) => !/\.test\.tsx?$/.test(path) && !path.startsWith('/src/i18n/catalogs/'),
);

const QUOTED = /(['"`])([A-Za-z]\w*(?:\.\w+)+)\1/g;

function keysQuotedIn(source: string): string[] {
  return [...source.matchAll(QUOTED)].map((match) => match[2]!);
}

describe('catalogue sections', () => {
  it('scans the application source', () => {
    expect(code.length).toBeGreaterThan(50);
    expect(code.some(([path]) => path.startsWith('/src/pages/legal/'))).toBe(true);
  });

  it.each(SECTIONS)("$name keys are read only inside $home", ({ keys, home }) => {
    const owned = new Set<string>(keys);
    const strays = code.flatMap(([path, source]) =>
      path.startsWith(home)
        ? []
        : keysQuotedIn(source)
            .filter((key) => owned.has(key))
            .map((key) => `${path}: ${key}`),
    );
    expect(strays).toEqual([]);
  });

  it.each(SECTIONS)('$home imports the $name section', ({ name, home }) => {
    const importer = code.find(
      ([path, source]) =>
        path.startsWith(home) && source.includes(`import '@/i18n/catalogs/${name}';`),
    );
    expect(importer?.[0]).toBeDefined();
  });

  it('every quoted key in the application exists in some catalogue', () => {
    // Catches a key whose section was never written, or a typo that only a
    // type assertion let through.
    const known = new Set<string>([...Object.keys(en), ...SECTIONS.flatMap((s) => s.keys)]);
    const prefixes = new Set([...known].map((key) => key.split('.')[0]));
    const unknown = code.flatMap(([path, source]) =>
      keysQuotedIn(source)
        .filter((key) => prefixes.has(key.split('.')[0]) && !known.has(key))
        .map((key) => `${path}: ${key}`),
    );
    expect(unknown).toEqual([]);
  });
});
