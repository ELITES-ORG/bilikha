/**
 * Median of integer centavos. Even counts take the lower of the two middle
 * values (plan 0028) — a reader should not have to guess which middle we mean.
 *
 * Empty input returns null rather than 0: zero is a price, and "no values" is
 * not one.
 */
export function medianCentavos(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  if (n % 2 === 1) {
    return sorted[Math.floor(n / 2)]!;
  }

  // Two middle values at n/2 - 1 and n/2; the lower is the earlier index.
  return sorted[n / 2 - 1]!;
}
