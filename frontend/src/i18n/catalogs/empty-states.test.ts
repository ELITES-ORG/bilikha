import { describe, expect, it } from 'vitest';

// English that used to be written inside components. It now lives in the
// catalogue, so it must not come back in a component.
const RETIRED = [
  'No offers yet — clients cannot hire what they cannot see priced.',
  'No inquiries yet — when a client contacts you, the thread lands in Messages.',
  'No work agreements yet — they appear here once you issue one from a conversation.',
  'Nothing agreed yet — the figure here is what you and a client put in writing, not what changed hands.',
  'No ratings yet — they appear after a completed engagement.',
  'No ratings yet.',
  'No ratings yet. Ratings come from clients who confirmed an engagement complete.',
];

const sources = import.meta.glob<string>('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('empty-state copy', () => {
  it('is read from the catalogue, not written in the components', () => {
    for (const [path, source] of Object.entries(sources)) {
      if (/\.test\.tsx$/.test(path)) continue;
      for (const text of RETIRED) expect(source, path).not.toContain(text);
    }
  });
});
