import { describe, expect, it } from 'vitest';

/**
 * No page may download a recording before it is played, or play one by
 * itself (ADR 0046): on a prepaid phone either spends someone's load. A
 * source check, so a player added anywhere later is held to the same rule.
 */
const sources = import.meta.glob<string>('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const code = Object.entries(sources).filter(([path]) => !/\.test\.tsx$/.test(path));

/** Each `<audio …>` and `<video …>` opening tag, read past `=>` inside `{…}` and `>` inside quotes. */
function mediaTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<(audio|video)\b/g)) {
    let depth = 0;
    let quote: string | null = null;
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end]!;
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      } else if (char === '>' && depth === 0) {
        break;
      }
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

describe('media players', () => {
  it('reads a tag whole, past an arrow function and a quoted ">"', () => {
    const [tag] = mediaTags('<video onPlay={() => go()} title="a > b" preload="none" />');
    expect(tag).toBe('<video onPlay={() => go()} title="a > b" preload="none" />');
  });

  it('finds the players it checks', () => {
    expect(code.some(([, source]) => mediaTags(source).length > 0)).toBe(true);
  });

  it('every <audio> and <video> waits to be played', () => {
    const eager = code.flatMap(([path, source]) =>
      mediaTags(source)
        .filter((tag) => !/\bpreload="none"/.test(tag))
        .map((tag) => `${path}: ${tag.replace(/\s+/g, ' ')}`),
    );
    expect(eager).toEqual([]);
  });

  it('nothing plays by itself', () => {
    const autoplaying = code.filter(([, source]) => /\bautoPlay\b/.test(source)).map(([path]) => path);
    expect(autoplaying).toEqual([]);
  });
});
