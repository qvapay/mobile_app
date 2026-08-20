/**
 * Tests del modo de fee en depósitos con tarjeta — las fórmulas deben coincidir
 * AL CENTAVO con el backend (cardDepositTotal / cardDepositNet en qpweb), que
 * usa el mismo redondeo Number(x.toFixed(2)). Los casos $133 @ 6% son los del
 * contrato del plan móvil.
 * @jest-environment node
 */
import { cardDepositPreview, cardFeeRateFor, round2 } from './cardFeeMode'

describe('cardDepositPreview', () => {
	test('on_top: el fee se suma al cobro y se acredita lo pedido', () => {
		expect(cardDepositPreview(133, 6, 'on_top')).toEqual({ pays: 140.98, credited: 133 })
	})

	test('included: la tarjeta paga exacto y se acredita el neto', () => {
		expect(cardDepositPreview(133, 6, 'included')).toEqual({ pays: 133, credited: 125.02 })
	})

	test('acepta el monto como string (input del teclado)', () => {
		expect(cardDepositPreview('133', 6, 'included')).toEqual({ pays: 133, credited: 125.02 })
	})

	test('fee 0: ambos modos son neutros', () => {
		expect(cardDepositPreview(50, 0, 'on_top')).toEqual({ pays: 50, credited: 50 })
		expect(cardDepositPreview(50, 0, 'included')).toEqual({ pays: 50, credited: 50 })
	})

	test.each([[''], ['0'], ['abc'], [null], [undefined], [-5]])('sin monto válido (%p) devuelve null', (amount) => {
		expect(cardDepositPreview(amount, 6, 'on_top')).toBeNull()
	})
})

describe('cardFeeRateFor', () => {
	const CARD = { fee_in: '6', fee_in_gold: '4.5' }

	test('usuario normal usa fee_in', () => {
		expect(cardFeeRateFor(CARD, { golden_check: false })).toBe(6)
	})

	test('usuario GOLD usa fee_in_gold', () => {
		expect(cardFeeRateFor(CARD, { golden_check: true })).toBe(4.5)
	})

	test('GOLD sin fee_in_gold cae a fee_in', () => {
		expect(cardFeeRateFor({ fee_in: '6' }, { golden_check: true })).toBe(6)
	})

	test('sin moneda devuelve 0', () => {
		expect(cardFeeRateFor(null, { golden_check: false })).toBe(0)
	})
})

describe('round2', () => {
	test('redondea igual que el backend (toFixed)', () => {
		expect(round2(133 * 0.94)).toBe(125.02) // 125.02000000000001 en float
		expect(round2('140.98')).toBe(140.98)
	})
})
