/** Progressive input masks for the public registration form. */

/**
 * Format a Brazilian phone number as the user types.
 * 10 digits -> (XX) XXXX-XXXX · 11 digits -> (XX) XXXXX-XXXX
 */
export function formatPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Format a height in meters as the user types: first digit is meters, the
 * next two are centimeters. "180" -> "1,80", "18" -> "1,8".
 */
export function formatHeightM(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 3);
  if (d.length === 0) return "";
  if (d.length === 1) return d;
  return `${d.slice(0, 1)},${d.slice(1)}`;
}

/** Turn a stored numeric height (e.g. 1.8) into the masked display "1,80". */
export function heightToMask(height: number): string {
  return height.toFixed(2).replace(".", ",");
}

/** Turn the masked height "1,80" into a number-coercible string "1.80". */
export function heightMaskToNumeric(value: string): string {
  return value.replace(",", ".");
}

/**
 * Format a number as Brazilian currency for display: "R$ 1.234,56".
 *
 * Only the digits go through Intl, in "decimal" style — comma for the
 * fraction, plain ASCII period for the thousands grouping. The "R$ " prefix
 * is a literal string with a normal space, not Intl's "currency" style:
 * that style inserts a non-breaking space (U+00A0) between symbol and
 * number instead, which would silently mismatch every other money string
 * in the app that already reads "R$ " + digits.
 */
export function formatBRL(value: number): string {
  const digits = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `R$ ${digits}`;
}
