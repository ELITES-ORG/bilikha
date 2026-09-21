import { describe, expect, it } from 'vitest';

/**
 * ADR 0038 rests on two structural facts, and neither was enforced by anything.
 *
 * Deleting `ModeSwitch` from `ModeAwareEmptyState` — the component, its import
 * and the now-unused `hasProfile`, exactly as a tidy refactor would — left all
 * five gates green and 147 tests passing. That is the way out of a list emptied
 * by the wrong mode (ADR 0025), and the only reason removing the page-header
 * toggle was safe rather than a regression. Losing it silently would put the
 * original trap back.
 *
 * The mirror image matters too: if `ModeNotice` ever grows a button, the mode
 * control is back on the list pages, which is the entire thing ADR 0038
 * removed.
 *
 * **Why this reads source instead of rendering.** ADR 0031 puts page rendering,
 * component markup and snapshots deliberately out of scope, and buying jsdom
 * plus a render library to assert one element would contradict it. These are
 * invariants about the source, in the same shape as the doc guards in
 * `scripts/`, and Vite's `?raw` import means no new dependency. It is a coarse
 * instrument: it proves the wiring is present, not that it works. What it
 * catches is the deletion — the failure that actually happened when tested.
 */
const componentSource = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pageSource = import.meta.glob('../pages/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(map: Record<string, string>, endsWith: string): string {
  const key = Object.keys(map).find((k) => k.endsWith(endsWith));
  if (!key) throw new Error(`no source found for ${endsWith}`);
  return map[key]!;
}

describe('the empty-list way out survives (ADR 0038, rule 1)', () => {
  const src = source(componentSource, 'ModeAwareEmptyState.tsx');

  it('imports ModeSwitch', () => {
    expect(src).toMatch(/import\s*\{\s*ModeSwitch\s*\}\s*from/);
  });

  it('renders ModeSwitch', () => {
    expect(src).toMatch(/<ModeSwitch\b/);
  });

  it('renders it only for an account that has a creative profile', () => {
    // A client has one mode; offering them a switch would be a control that
    // cannot do anything.
    expect(src).toMatch(/profileSlug/);
    expect(src).toMatch(/hasProfile\s*&&\s*<ModeSwitch/);
  });
});

describe('the mode notice never becomes a control (ADR 0038, rule 2)', () => {
  const src = source(componentSource, 'ModeNotice.tsx');

  it('has no button', () => {
    expect(src).not.toMatch(/<button\b/);
  });

  it('has no pressed state', () => {
    expect(src).not.toMatch(/aria-pressed/);
  });

  it('does not write the mode', () => {
    // Reading it is the whole job. A mutation here means the toggle came back
    // wearing different clothes.
    expect(src).not.toMatch(/useSetViewMode/);
  });

  it('offers a link to the account hub instead', () => {
    expect(src).toMatch(/to="\/account"/);
  });

  it('says nothing at all without a creative profile', () => {
    expect(src).toMatch(/profileSlug/);
  });
});

describe('the page headers stay free of the switch (ADR 0038)', () => {
  it.each(['DirectoryPage.tsx', 'MessagesPage.tsx', 'HistoryPage.tsx'])(
    '%s does not render ModeSwitch',
    (page) => {
      expect(source(pageSource, page)).not.toMatch(/<ModeSwitch\b/);
    },
  );
});
