import { AppError } from './http-error.js';

/**
 * Accepts 09171234567, +639171234567, 639171234567, and any of those with
 * spaces or dashes. Stores one canonical form, without which dedup and lookup
 * both silently fail.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');

  if (/^\+639\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;

  throw AppError.badRequest(
    'Enter a valid Philippine mobile number, for example 09171234567.',
  );
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
