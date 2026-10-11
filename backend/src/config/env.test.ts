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

  it('accepts a long enough secret, trimmed', () => {
    const secret = 'f'.repeat(64);
    const result = envSchema.safeParse({ ...BASE, ID_HASH_SECRET: `${secret}\n` });

    expect(result.data?.ID_HASH_SECRET).toBe(secret);
  });
});
