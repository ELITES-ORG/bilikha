/**
 * Budget query values are positive integers in pesos. Empty and garbage both
 * mean "not set" — the directory treats them the same.
 */
export function parseBudget(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}
