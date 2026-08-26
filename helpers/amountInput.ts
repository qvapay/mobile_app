// Pure sanitizing logic for free-typed money amounts (TextInput with
// keyboardType="decimal-pad"), extracted so it can be unit-tested under a
// `@jest-environment node` docblock (jest 30 devDeps vs jest 29 preset clash).
// The bug that motivated it (issue #15): in comma-decimal locales the iOS/Android
// numeric keyboard types `10,50`, and `parseFloat('10,50')` silently truncates
// to `10` — the wrong amount gets submitted. Keep this file dependency-free.

const MAX_DECIMAL_PLACES = 2 // default: currency → 2 decimals

/**
 * Normalizes a typed amount into a dot-decimal numeric string, keeping it
 * suitable as the controlled TextInput value while the user is still typing
 * (so "10." survives). Comma → dot, strips non-numeric chars, keeps only the
 * first decimal separator and at most `maxDecimals` decimals.
 * @param text - Raw TextInput value, e.g. "10,50".
 * @param maxDecimals - Decimal places to keep (default 2; 8 for crypto amounts).
 * @returns Sanitized value, e.g. "10.50".
 */
export function sanitizeAmountInput(text: string | null | undefined, maxDecimals: number = MAX_DECIMAL_PLACES): string {

	if (!text) { return '' }

	let sanitized = String(text).replace(/,/g, '.').replace(/[^0-9.]/g, '')

	// Only the FIRST separator counts as the decimal point.
	const dotIndex = sanitized.indexOf('.')
	if (dotIndex !== -1) { sanitized = sanitized.slice(0, dotIndex + 1) + sanitized.slice(dotIndex + 1).replace(/\./g, '') }

	const [integerPart, decimalPart] = sanitized.split('.')
	if (decimalPart !== undefined) { return integerPart + '.' + decimalPart.slice(0, maxDecimals) }

	return integerPart
}

/**
 * Parses a typed amount accepting both `.` and `,` as decimal separator.
 * @param text - Raw or sanitized amount string.
 * @returns Parsed amount, or 0 when not a number.
 */
export function parseAmountInput(text: string | null | undefined): number {
	const parsed = parseFloat(sanitizeAmountInput(text))
	return Number.isFinite(parsed) ? parsed : 0
}
