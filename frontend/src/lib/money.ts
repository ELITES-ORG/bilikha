/** Format integer centavos for display. Never send pesos to the API. */

function formatPesos(centavos: number): string {
  const pesos = Math.round(centavos) / 100;
  return `₱${pesos.toLocaleString('en-PH', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

/**
 * "from ₱15,000" | "₱5,000 – ₱15,000" | "Price on request"
 * Money stays as integer centavos until this edge formatter.
 */
export function formatPriceRange(
  minCentavos: number | null | undefined,
  maxCentavos: number | null | undefined,
): string {
  if (minCentavos == null && maxCentavos == null) return 'Price on request';
  if (minCentavos != null && maxCentavos == null) return `from ${formatPesos(minCentavos)}`;
  if (minCentavos == null && maxCentavos != null) return formatPesos(maxCentavos);
  return `${formatPesos(minCentavos!)} – ${formatPesos(maxCentavos!)}`;
}
