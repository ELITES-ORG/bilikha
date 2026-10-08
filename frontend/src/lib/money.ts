/**
 * Groups a peso *input* in threes as it is typed: "10000" -> "10,000".
 *
 * Grouped by regex rather than by Number().toLocaleString() on purpose: the
 * input is a digit string, and routing it through a float would lose precision
 * on a long paste and re-introduce the locale's decimal handling for a field
 * that only ever holds whole pesos.
 */
export function groupPesoDigits(raw: string, maxDigits = 7): string {
  const digits = raw
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, maxDigits);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Grouped peso input -> integer centavos. Undefined when the field is empty. */
export function pesoInputToCentavos(raw: string): number | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  const pesos = Number(digits);
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return pesos * 100;
}

/** Integer centavos -> the grouped string the input displays. */
export function centavosToPesoInput(centavos: number | null | undefined): string {
  if (centavos == null) return '';
  return groupPesoDigits(String(Math.round(centavos / 100)));
}

/** Format integer centavos for display. Never send pesos to the API. */

export function formatPesos(centavos: number): string {
  const pesos = Math.round(centavos) / 100;
  return `₱${pesos.toLocaleString('en-PH', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`;
}

/**
 * "From ₱15,000" | "₱5,000 – ₱15,000" | "₱5,000" | "Price on request"
 * Always returns something: an offer always shows a price line.
 * Money stays as integer centavos until this edge formatter.
 */
export function formatPriceRange(
  minCentavos: number | null | undefined,
  maxCentavos: number | null | undefined,
): string {
  if (minCentavos == null && maxCentavos == null) return 'Price on request';
  if (minCentavos != null && maxCentavos == null) return `From ${formatPesos(minCentavos)}`;
  if (minCentavos == null && maxCentavos != null) return formatPesos(maxCentavos);
  // A range whose ends are equal is one price, not "₱5,000 – ₱5,000".
  if (minCentavos === maxCentavos) return formatPesos(minCentavos!);
  return `${formatPesos(minCentavos!)} – ${formatPesos(maxCentavos!)}`;
}

/**
 * A client posting's budget. The same ranges as `formatPriceRange`, but a
 * posting with no budget says so: "Price on request" is a creative's phrase
 * for an offer, and reads wrong for what a client is willing to pay.
 */
export function formatBudgetRange(
  minCentavos: number | null | undefined,
  maxCentavos: number | null | undefined,
): string {
  if (minCentavos == null && maxCentavos == null) return 'Budget not given';
  return formatPriceRange(minCentavos, maxCentavos);
}
