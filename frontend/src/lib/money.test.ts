import { describe, expect, it } from 'vitest';
import {
  centavosToPesoInput,
  formatPriceRange,
  groupPesoDigits,
  pesoInputToCentavos,
} from './money';

describe('groupPesoDigits', () => {
  it('groups in threes as digits are typed', () => {
    expect(groupPesoDigits('1')).toBe('1');
    expect(groupPesoDigits('1000')).toBe('1,000');
    expect(groupPesoDigits('1000000')).toBe('1,000,000');
  });

  it('ignores anything that is not a digit', () => {
    expect(groupPesoDigits('1a0b0c0')).toBe('1,000');
    expect(groupPesoDigits('₱5,000')).toBe('5,000');
  });

  it('strips leading zeros without emptying the field', () => {
    expect(groupPesoDigits('007')).toBe('7');
    expect(groupPesoDigits('0')).toBe('0');
  });

  it('caps at the digit limit', () => {
    expect(groupPesoDigits('123456789')).toBe('1,234,567');
  });

  it('returns empty for empty', () => {
    expect(groupPesoDigits('')).toBe('');
    expect(groupPesoDigits('abc')).toBe('');
  });
});

describe('pesoInputToCentavos', () => {
  it('converts pesos to integer centavos', () => {
    expect(pesoInputToCentavos('10,000')).toBe(1_000_000);
    expect(pesoInputToCentavos('1')).toBe(100);
  });

  it('is undefined rather than zero for an empty field', () => {
    // Undefined means "not set" — zero would be a price of ₱0.
    expect(pesoInputToCentavos('')).toBeUndefined();
    expect(pesoInputToCentavos('0')).toBeUndefined();
  });

  it('always returns a whole number', () => {
    const value = pesoInputToCentavos('12,345');
    expect(Number.isInteger(value)).toBe(true);
  });
});

describe('a peso round trip', () => {
  it('survives input -> centavos -> input', () => {
    for (const typed of ['1', '500', '1,000', '25,000', '1,000,000']) {
      const centavos = pesoInputToCentavos(typed);
      expect(centavosToPesoInput(centavos)).toBe(typed);
    }
  });

  it('shows an empty field for no price', () => {
    expect(centavosToPesoInput(null)).toBe('');
    expect(centavosToPesoInput(undefined)).toBe('');
  });
});

describe('formatPriceRange', () => {
  it('says price on request when there is none', () => {
    expect(formatPriceRange(null, null)).toBe('Price on request');
  });

  it('says "from" when only a minimum is set', () => {
    expect(formatPriceRange(1_500_000, null)).toBe('from ₱15,000');
  });

  it('renders a full range', () => {
    expect(formatPriceRange(500_000, 1_500_000)).toBe('₱5,000 – ₱15,000');
  });

  it('renders a maximum alone as a single price', () => {
    expect(formatPriceRange(null, 500_000)).toBe('₱5,000');
  });
});
