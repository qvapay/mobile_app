/**
 * Pure-logic unit tests — node environment (see keypadAmount.test.js for why).
 * @jest-environment node
 */
import { getStatusColor } from './transactionStatus'

const theme = {
	colors: {
		success: '#7BFFB1',
		warning: '#ff9f43',
		danger: '#DB253E',
		primary: '#6759EF',
		secondaryText: '#9DA3B4',
	},
}

describe('getStatusColor', () => {
	test('settled statuses are green', () => {
		for (const s of ['paid', 'completed', 'received']) {
			expect(getStatusColor(s, theme)).toBe(theme.colors.success)
		}
	})

	test('in-flight statuses are amber', () => {
		for (const s of ['pending', 'open', 'processing', 'unpaid']) {
			expect(getStatusColor(s, theme)).toBe(theme.colors.warning)
		}
	})

	test('terminal failures are red', () => {
		for (const s of ['cancelled', 'failed']) {
			expect(getStatusColor(s, theme)).toBe(theme.colors.danger)
		}
	})

	test('revision (dispute) uses the brand primary', () => {
		expect(getStatusColor('revision', theme)).toBe(theme.colors.primary)
	})

	test('unknown statuses fall back to the secondary text color', () => {
		expect(getStatusColor('whatever', theme)).toBe(theme.colors.secondaryText)
		expect(getStatusColor(undefined, theme)).toBe(theme.colors.secondaryText)
	})
})
