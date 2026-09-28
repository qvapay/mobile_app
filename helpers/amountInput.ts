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

const CENT = 100

/**
 * Trunca a centavos HACIA ABAJO. Nunca se ofrece mover más de lo que hay: redondear
 * hacia arriba pondría en el campo un importe que el saldo no cubre.
 *
 * El `Math.round(… * 1e6) / 1e6` de en medio absorbe la basura binaria de
 * multiplicar por 100 antes de truncar (12.34 * 100 da 1233.9999999999998).
 */
export const floorCents = (value: number): number => Math.floor(Math.round(value * CENT * 1e6) / 1e6) / CENT

/**
 * Importe para un chip de porcentaje (25/50/100) sobre el máximo movible.
 *
 * El 100% devuelve el máximo EXACTO, sin truncar: es lo único que garantiza que "MAX"
 * deje el saldo en cero y no en un centavo suelto.
 *
 * @returns Cadena con dos decimales, o '' cuando no hay nada que mover (el campo se
 *   queda vacío en vez de con un '0.00' que parece un importe).
 */
export const percentAmount = (max: number, percent: number): string => {
	const value = percent >= 100 ? max : floorCents((max * percent) / 100)
	return value > 0 ? value.toFixed(2) : ''
}

