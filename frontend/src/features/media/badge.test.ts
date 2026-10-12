import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from '@/i18n/catalogs/en';
import { mediaBadgeText } from './badge';

const t = (key: MessageKey) => (en as Readonly<Record<string, string>>)[key] ?? key;

describe('mediaBadgeText', () => {
  it('gives one recording its length', () => {
    expect(mediaBadgeText({ kind: 'audio', count: 1, durationSeconds: 222 }, t)).toBe('Audio · 3:42');
  });

  it('counts several of a kind instead', () => {
    expect(mediaBadgeText({ kind: 'video', count: 2, durationSeconds: 30 }, t)).toBe('2 · Video');
  });

  it('names a document, which has no length', () => {
    expect(mediaBadgeText({ kind: 'document', count: 1, durationSeconds: null }, t)).toBe('PDF');
  });
});
