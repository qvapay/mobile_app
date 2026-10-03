/**
 * @jest-environment node
 */
import { canToggleUsd, usdToUnits, unitsToUsdInput, unitsToInput } from './sendAmountModel'

describe('canToggleUsd', () => {
	test('solo activos volátiles con precio', () => {
		expect(canToggleUsd({ stable: false }, 3000)).toBe(true)
		expect(canToggleUsd({ stable: true }, 1)).toBe(false)
		expect(canToggleUsd({ stable: false }, null)).toBe(false)
		expect(canToggleUsd({ stable: false }, 0)).toBe(false)
	})
})

describe('usdToUnits', () => {
	test('convierte a unidades mínimas redondeando hacia abajo', () => {
		// $100 a $3000/ETH = 0.0333… ETH → nunca por encima
		expect(usdToUnits('100', 3000, 18)).toBe(33333333333333333n)
		// $1 a $0.25/TRX = 4 TRX exactos (6 decimales)
		expect(usdToUnits('1', 0.25, 6)).toBe(4000000n)
		// BTC (8 decimales)
		expect(usdToUnits('65', 65000, 8)).toBe(100000n)
	})

	test('acepta coma y rechaza más de 2 decimales o texto inválido', () => {
		expect(usdToUnits('1,5', 1.5, 6)).toBe(1000000n)
		expect(() => usdToUnits('1.234', 2, 6)).toThrow()
		expect(() => usdToUnits('abc', 2, 6)).toThrow()
	})
})

describe('unitsToUsdInput', () => {
	test('céntimos hacia abajo, sin ceros de cola', () => {
		expect(unitsToUsdInput(10n ** 18n, 3000.129, 18)).toBe('3000.12')
		expect(unitsToUsdInput(4000000n, 0.25, 6)).toBe('1')
		expect(unitsToUsdInput(0n, 3000, 18)).toBe('')
	})

	test('ida y vuelta nunca supera las unidades de partida', () => {
		const units = 123456789012345678n
		const back = usdToUnits(unitsToUsdInput(units, 2789.37, 18), 2789.37, 18)
		expect(back <= units).toBe(true)
	})
})

describe('unitsToInput', () => {
	test('en modo token es exacto; sin precio cae a token', () => {
		expect(unitsToInput(1500000n, 'token', 0.25, 6)).toBe('1.5')
		expect(unitsToInput(1500000n, 'usd', null, 6)).toBe('1.5')
		expect(unitsToInput(1500000n, 'usd', 0.25, 6)).toBe('0.37')
	})
})
