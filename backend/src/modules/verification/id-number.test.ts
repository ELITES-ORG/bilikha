import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/http-error.js';
import { hashIdNumber, idHashReady, normalizeIdNumber } from './id-number.js';

const SECRET = 'a'.repeat(64);
const OTHER_SECRET = 'b'.repeat(64);

function errorOf(work: () => unknown): AppError {
  try {
    work();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError, but nothing was thrown');
}

describe('normalizeIdNumber', () => {
  it('keeps only letters and digits, uppercased', () => {
    expect(normalizeIdNumber('1234-5678 9012')).toBe('123456789012');
    expect(normalizeIdNumber(' n01-23.456 ')).toBe('N0123456');
  });

  it('folds full-width digits into plain ones', () => {
    expect(normalizeIdNumber('１２３４')).toBe('1234');
  });
});

describe('hashIdNumber', () => {
  it('refuses look-alike letters and digits from other scripts rather than hashing them differently', () => {
    // Cyrillic "О" for Latin "O", and Arabic-Indic digits for 1234.
    for (const raw of ['NО1234', '١٢٣٤']) {
      expect(errorOf(() => hashIdNumber('philsys_id', raw, SECRET)).status, raw).toBe(400);
    }
    // The message names no number.
    expect(errorOf(() => hashIdNumber('philsys_id', 'NО1234', SECRET)).message).not.toContain('1234');
  });

  it('still accepts full-width digits, which fold to plain ones', () => {
    expect(hashIdNumber('philsys_id', '１２３４', SECRET)).toBe(hashIdNumber('philsys_id', '1234', SECRET));
  });

  it('hashes the same ID written two ways the same', () => {
    expect(hashIdNumber('philsys_id', '1234-5678 9012', SECRET)).toBe(
      hashIdNumber('philsys_id', '123456789012', SECRET),
    );
  });

  it('hashes the same number differently under two ID types', () => {
    expect(hashIdNumber('philsys_id', '123456789012', SECRET)).not.toBe(
      hashIdNumber('umid', '123456789012', SECRET),
    );
  });

  it('hashes a PhilID and its printed ePhilID the same: both carry the PhilSys card number', () => {
    expect(hashIdNumber('ephilid', '1234-5678-9012-3456', SECRET)).toBe(
      hashIdNumber('philsys_id', '1234 5678 9012 3456', SECRET),
    );
    // And no further: the ePhilID is not another document's number.
    expect(hashIdNumber('ephilid', '123456789012', SECRET)).not.toBe(
      hashIdNumber('umid', '123456789012', SECRET),
    );
  });

  it('hashes differently under a different secret', () => {
    expect(hashIdNumber('philsys_id', '123456789012', SECRET)).not.toBe(
      hashIdNumber('philsys_id', '123456789012', OTHER_SECRET),
    );
  });

  it('is 64 hex characters and never contains the number', () => {
    const hash = hashIdNumber('drivers_license', 'N01-23-456789', SECRET);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('N0123456789');
    expect(hash.toUpperCase()).not.toContain('N0123456789');
  });

  it('answers 503 without a secret', () => {
    // '' rather than undefined: an undefined argument takes the default, which
    // is whatever this machine's backend/.env holds.
    const error = errorOf(() => hashIdNumber('philsys_id', '123456789012', ''));

    expect(error.status).toBe(503);
    expect(error.code).toBe('ID_HASH_UNAVAILABLE');
    expect(idHashReady('')).toBe(false);
    expect(idHashReady(SECRET)).toBe(true);
  });

  it('refuses a number shorter than four characters', () => {
    const error = errorOf(() => hashIdNumber('barangay_id', 'A-1', SECRET));

    expect(error.status).toBe(400);
  });
});
