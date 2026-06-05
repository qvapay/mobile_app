/**
 * Pure-logic unit test — runs in the node environment to avoid the React Native
 * jest preset's bundled jest 29 packages (which clash with jest 30 in devDeps).
 * @jest-environment node
 */
import { applyKeypadKey, isValidNumericAmount } from './keypadAmount'

// Type a sequence of keys starting from the initial '0' amount.
const type = (keys, start = '0') => keys.reduce((amt, k) => applyKeypadKey(amt, k), start)

describe('applyKeypadKey', () => {

	describe('integer entry', () => {
		test('replaces the leading zero with the first digit', () => {
			expect(applyKeypadKey('0', '5')).toBe('5')
		})

		test('appends subsequent digits', () => {
			expect(type(['1', '2', '3'])).toBe('123')
		})

		test('does not allow a leading "00"', () => {
			expect(applyKeypadKey('0', '0')).toBe('0')
		})

		test('caps the integer part at 5 digits', () => {
			expect(type(['1', '2', '3', '4', '5'])).toBe('12345')
			expect(applyKeypadKey('12345', '6')).toBe('12345') // rejected
		})
	})

	describe('decimals (regression: were blocked by the total-digit limit)', () => {
		test('adds a single decimal point', () => {
			expect(applyKeypadKey('12', '.')).toBe('12.')
			expect(applyKeypadKey('0', '.')).toBe('0.')
		})

		test('ignores a second decimal point', () => {
			expect(applyKeypadKey('12.3', '.')).toBe('12.3')
		})

		test('allows decimals after a 4-digit integer (1234.56)', () => {
			expect(type(['1', '2', '3', '4', '.', '5', '6'])).toBe('1234.56')
		})

		test('allows the maximum 99999.99', () => {
			expect(type(['9', '9', '9', '9', '9', '.', '9', '9'])).toBe('99999.99')
		})

		test('caps decimals at 2 places', () => {
			expect(applyKeypadKey('1.23', '4')).toBe('1.23') // rejected
		})

		test('supports 0.x amounts', () => {
			expect(type(['.', '5'])).toBe('0.5')
			expect(type(['.', '0', '5'])).toBe('0.05')
		})
	})

	describe('backspace (regression: max balance got stuck)', () => {
		test('removes the last character', () => {
			expect(applyKeypadKey('1234.56', 'backspace')).toBe('1234.5')
		})

		test('deletes an over-limit max-balance amount instead of getting stuck', () => {
			// 6-digit integer part exceeds the manual limit but must stay deletable.
			expect(applyKeypadKey('123456.78', 'backspace')).toBe('123456.7')
		})

		test('falls back to "0" when emptied', () => {
			expect(applyKeypadKey('5', 'backspace')).toBe('0')
			expect(applyKeypadKey('0', 'backspace')).toBe('0')
		})

		test('can clear a full over-limit max balance down to 0', () => {
			let amt = '123456.78'
			for (let i = 0; i < 20 && amt !== '0'; i++) { amt = applyKeypadKey(amt, 'backspace') }
			expect(amt).toBe('0')
		})
	})
})

describe('isValidNumericAmount', () => {
	test('rejects a bare zero and over-limit candidates', () => {
		expect(isValidNumericAmount('0')).toBe(false)
		expect(isValidNumericAmount('123456')).toBe(false) // 6 integer digits
		expect(isValidNumericAmount('1.234')).toBe(false)  // 3 decimals
	})

	test('accepts valid amounts', () => {
		expect(isValidNumericAmount('5')).toBe(true)
		expect(isValidNumericAmount('1234.56')).toBe(true)
		expect(isValidNumericAmount('99999.99')).toBe(true)
	})
})
