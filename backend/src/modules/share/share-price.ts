/**
 * How a preview card words a price. The page it opens uses `formatPriceRange`
 * in `frontend/src/lib/money.ts`; the two must agree, and
 * `frontend/src/lib/money-parity.test.ts` fails the moment they do not.
 *
 * Its own file with no imports, so that test can load it without the API's
 * environment. Contracts hold types only (ADR 0037), so it cannot live there.
 */
export function formatPriceRange(
  minCentavos: number | null | undefined,
  maxCentavos: number | null | undefined,
): string {
  const pesos = (centavos: number) =>
    `₱${(Math.round(centavos) / 100).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
  if (minCentavos == null && maxCentavos == null) return 'Price on request';
  if (minCentavos != null && maxCentavos == null) return `From ${pesos(minCentavos)}`;
  if (minCentavos == null && maxCentavos != null) return pesos(maxCentavos);
  if (minCentavos === maxCentavos) return pesos(minCentavos!);
  return `${pesos(minCentavos!)} – ${pesos(maxCentavos!)}`;
}
