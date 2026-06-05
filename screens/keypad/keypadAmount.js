// Pure amount-input logic for the Keypad screen, extracted so it can be unit-tested in
// isolation. Two input bugs lived here:
//   1. Decimals were blocked because the length limit counted integer + decimal digits
//      together (so "1234.56" = 6 digits > 5 was rejected).
//   2. An over-limit amount set via "max balance" got stuck — backspace was also
//      rejected by the length check, so it couldn't be deleted.
// Keep this file dependency-free (no React Native imports) so the tests stay fast.

export const MAX_AMOUNT_LENGTH = 5    // max digits allowed in the INTEGER part
export const MAX_DECIMAL_PLACES = 2   // currency → 2 decimals

// Is `next` (the candidate amount after pressing a digit key) acceptable?
export function isValidNumericAmount(next) {

	// Reject a bare "0" — prevents "00" and staying at zero via a digit press.
	if (next === '0') { return false }

	const [integerPart, decimalPart = ''] = next.split('.')

	// At most MAX_DECIMAL_PLACES decimals.
	if (decimalPart.length > MAX_DECIMAL_PLACES) { return false }

	// Limit ONLY the integer part — decimals must stay enterable regardless of how many
	// integer digits there are.
	if (integerPart.length > MAX_AMOUNT_LENGTH) { return false }

	return true
}

// Given the current amount string and a pressed key ('0'-'9' | '.' | 'backspace'),
// return the next amount string. Returns the amount UNCHANGED when the key is rejected.
export function applyKeypadKey(amount, key) {

	// Backspace only ever shortens — never blocked. Falls back to "0" when emptied.
	if (key === 'backspace') { return amount.slice(0, -1) || '0' }

	if (key === '.') {
		if (amount.includes('.')) { return amount }   // only one decimal point
		return amount === '0' ? '0.' : amount + '.'
	}

	// Numeric key: replace the leading zero, otherwise append.
	const next = amount === '0' ? key : amount + key
	return isValidNumericAmount(next) ? next : amount
}
