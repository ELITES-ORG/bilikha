import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

/** The fewest variables that boot: everything else has a default or is optional. */
const BASE = {
  DATABASE_URL: 'postgresql://bilikha:bilikha@localhost:5432/bilikha',
  SESSION_SECRET: 's'.repeat(32),
};

describe('env: ID verification settings', () => {
  it('defaults the ID bucket and leaves the hash secret unset', () => {
    const result = envSchema.safeParse(BASE);

    expect(result.success).toBe(true);
    expect(result.data?.SUPABASE_ID_BUCKET).toBe('ids');
    expect(result.data?.ID_HASH_SECRET).toBeUndefined();
  });

  it('refuses an ID bucket that is the public media bucket', () => {
    const result = envSchema.safeParse({
      ...BASE,
      SUPABASE_STORAGE_BUCKET: 'media',
      SUPABASE_ID_BUCKET: 'media',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(
      'SUPABASE_ID_BUCKET',
    );
  });

  it('refuses a hash secret shorter than 32 characters', () => {
    const result = envSchema.safeParse({ ...BASE, ID_HASH_SECRET: 'short' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('ID_HASH_SECRET');
  });

  it('treats a blank hash secret as unset', () => {
    const result = envSchema.safeParse({ ...BASE, ID_HASH_SECRET: '   ' });

    expect(result.success).toBe(true);
    expect(result.data?.ID_HASH_SECRET).toBeUndefined();
  });

  it("refuses the example file's placeholder, which is public", () => {
    const result = envSchema.safeParse({
      ...BASE,
      ID_HASH_SECRET: 'replace-me-with-64-hex-characters-never-rotate-it',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).join(' ')).toContain('placeholder');
  });

  it('refuses the media bucket under another letter case', () => {
    const result = envSchema.safeParse({ ...BASE, SUPABASE_STORAGE_BUCKET: 'media', SUPABASE_ID_BUCKET: 'Media' });

    expect(result.success).toBe(false);
  });

  it('refuses an ID bucket that is not a plain bucket name', () => {
    for (const name of ['media/', 'ids private', 'IDS', '../media', '']) {
      const result = envSchema.safeParse({ ...BASE, SUPABASE_ID_BUCKET: name });
      expect(result.success, name).toBe(false);
    }
    expect(envSchema.safeParse({ ...BASE, SUPABASE_ID_BUCKET: 'ids-staging_2' }).success).toBe(true);
  });

  it('accepts a long enough secret, trimmed', () => {
    const secret = 'f'.repeat(64);
    const result = envSchema.safeParse({ ...BASE, ID_HASH_SECRET: `${secret}\n` });

    expect(result.data?.ID_HASH_SECRET).toBe(secret);
  });
});

describe('env: media upload kinds', () => {
  it('means images only when unset', () => {
    const result = envSchema.safeParse(BASE);

    expect(result.success).toBe(true);
    expect(result.data?.MEDIA_UPLOAD_KINDS).toEqual([]);
  });

  it('reads a comma-separated list, trimmed', () => {
    const result = envSchema.safeParse({ ...BASE, MEDIA_UPLOAD_KINDS: 'audio, video' });

    expect(result.success).toBe(true);
    expect(result.data?.MEDIA_UPLOAD_KINDS).toEqual(['audio', 'video']);
  });

  it('refuses a kind it does not know', () => {
    const result = envSchema.safeParse({ ...BASE, MEDIA_UPLOAD_KINDS: 'audio,gif' });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some((issue) => issue.path.join('.').startsWith('MEDIA_UPLOAD_KINDS')),
    ).toBe(true);
  });
});
