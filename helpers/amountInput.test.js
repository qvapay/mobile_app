/**
 * @jest-environment node
 */
import { sanitizeAmountInput, parseAmountInput } from './amountInput'

describe('sanitizeAmountInput', () => {

	test('passes through a plain dot-decimal amount', () => {
		expect(sanitizeAmountInput('10.50')).toBe('10.50')
	})

	test('normalizes comma decimal separator to dot', () => {
		expect(sanitizeAmountInput('10,50')).toBe('10.50')
	})

	test('keeps a trailing separator while the user is still typing', () => {
		expect(sanitizeAmountInput('10.')).toBe('10.')
		expect(sanitizeAmountInput('10,')).toBe('10.')
	})

	test('keeps only the first decimal separator', () => {
		expect(sanitizeAmountInput('1.2.3')).toBe('1.23')
		expect(sanitizeAmountInput('1,2,3')).toBe('1.23')
	})

	test('limits to 2 decimal places', () => {
		expect(sanitizeAmountInput('10.505')).toBe('10.50')
	})

	test('strips non-numeric characters (pasted values)', () => {
		expect(sanitizeAmountInput('$1 234,56')).toBe('1234.56')
		expect(sanitizeAmountInput('abc')).toBe('')
	})

	test('accepts a custom decimal cap for crypto amounts', () => {
		expect(sanitizeAmountInput('0,00012345', 8)).toBe('0.00012345')
		expect(sanitizeAmountInput('0.000123456789', 8)).toBe('0.00012345')
	})

	test('handles empty and nullish input', () => {
		expect(sanitizeAmountInput('')).toBe('')
		expect(sanitizeAmountInput(null)).toBe('')
		expect(sanitizeAmountInput(undefined)).toBe('')
	})
})

describe('parseAmountInput', () => {

	test('parses comma decimals without truncating (issue #15)', () => {
		expect(parseAmountInput('10,50')).toBe(10.5)
	})

	test('parses dot decimals', () => {
		expect(parseAmountInput('10.50')).toBe(10.5)
	})

	test('returns 0 for non-numeric input', () => {
		expect(parseAmountInput('')).toBe(0)
		expect(parseAmountInput('.')).toBe(0)
		expect(parseAmountInput('abc')).toBe(0)
	})
})
