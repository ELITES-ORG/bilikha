import { describe, expect, it } from 'vitest';
import {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generateTemporaryPassword,
} from './temporary-password.js';

describe('generateTemporaryPassword', () => {
  it('uses only characters that survive being read aloud', () => {
    const allowed = new Set([...TEMPORARY_PASSWORD_ALPHABET, '-']);

    for (let i = 0; i < 200; i += 1) {
      for (const character of generateTemporaryPassword()) {
        expect(allowed.has(character), `unexpected character ${character}`).toBe(true);
      }
    }
  });

  it('excludes the look-alikes on purpose', () => {
    for (const character of ['0', 'O', '1', 'l', 'I', '5', 'S', '2', 'Z']) {
      expect(TEMPORARY_PASSWORD_ALPHABET).not.toContain(character);
    }
  });

  it('carries the full length regardless of the grouping hyphens', () => {
    const password = generateTemporaryPassword();
    expect(password.replace(/-/g, '')).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
  });

  it('clears the minimum the password field enforces', () => {
    // POST /api/v1/me/password requires at least 10 characters, so a generated
    // password that fell under it would be unusable for its only purpose.
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(10);
  });

  it('does not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateTemporaryPassword());
    expect(seen.size).toBe(500);
  });
});
