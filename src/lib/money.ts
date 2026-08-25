/**
 * Money and number formatting for EGP currency.
 * PostgREST returns numeric columns as strings; always coerce before arithmetic.
 */

/**
 * Safely coerce a value to a number.
 * PostgREST numeric columns come as strings (e.g. "1900.00").
 * Returns 0 for null, undefined, or NaN.
 */
export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? 0 : n
}

/**
 * Format a number as Egyptian Pounds (EGP).
 * Arabic: "١٬٩٠٠ ج.م" using Eastern Arabic numerals.
 * English: "EGP 1,900"
 * Always 0 decimal places for whole numbers, otherwise 2.
 *
 * @param v Value to format (coerced via num())
 * @param locale 'ar' or 'en'
 * @param opts.compact Use notation:'compact' for dashboard tiles (e.g. "1.9K")
 * @param opts.withSymbol Include the EGP symbol (default true)
 */
export function formatMoney(
  v: string | number | null | undefined,
  locale: 'ar' | 'en',
  opts?: { compact?: boolean; withSymbol?: boolean }
): string {
  const value = num(v)
  const { compact = false, withSymbol = true } = opts || {}

  // Determine decimal places based on whether it's a whole number
  const minimumFractionDigits = value === Math.floor(value) ? 0 : 2
  const maximumFractionDigits = 2

  const formatter = new Intl.NumberFormat(
    locale === 'ar' ? 'ar-EG' : 'en-US',
    {
      style: withSymbol ? 'currency' : 'decimal',
      currency: 'EGP',
      minimumFractionDigits,
      maximumFractionDigits,
      notation: compact ? 'compact' : 'standard',
    }
  )

  return formatter.format(value)
}

/**
 * Format a number with thousands separator, no currency symbol.
 * Arabic uses Eastern Arabic numerals.
 * Always 0 decimal places for whole numbers, otherwise 2.
 */
export function formatNumber(
  v: string | number | null | undefined,
  locale: 'ar' | 'en'
): string {
  const value = num(v)
  const minimumFractionDigits = value === Math.floor(value) ? 0 : 2

  const formatter = new Intl.NumberFormat(
    locale === 'ar' ? 'ar-EG' : 'en-US',
    {
      minimumFractionDigits,
      maximumFractionDigits: 2,
    }
  )

  return formatter.format(value)
}

/**
 * Format a value as a percentage.
 * By default, expects a decimal (e.g., 0.75 → "75%").
 * When isWholeNumber=true, the value is treated as already a percentage number
 * (e.g., discounts.value stores 10 to mean 10%, not 0.1).
 * Always 0 decimal places for whole percentages, otherwise 2.
 *
 * @param v Value to format (coerced via num())
 * @param locale 'ar' or 'en'
 * @param opts.isWholeNumber If true, divides by 100 before formatting (for discounts.value)
 */
export function formatPercent(
  v: string | number | null | undefined,
  locale: 'ar' | 'en',
  opts?: { isWholeNumber?: boolean }
): string {
  let value = num(v)
  const { isWholeNumber = false } = opts || {}

  // If the value is stored as a whole number (like discounts.value = 10 for 10%),
  // divide by 100 before using Intl's percent style.
  if (isWholeNumber) {
    value = value / 100
  }

  const minimumFractionDigits = (value * 100) === Math.floor(value * 100) ? 0 : 2

  const formatter = new Intl.NumberFormat(
    locale === 'ar' ? 'ar-EG' : 'en-US',
    {
      style: 'percent',
      minimumFractionDigits,
      maximumFractionDigits: 2,
    }
  )

  return formatter.format(value)
}
