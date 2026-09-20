/**
 * @jest-environment node
 */
import { DUST_USD_THRESHOLD, isDustTx, splitDust } from './dust'

const tx = (over) => ({ direction: 'in', amount: '0.001', kind: undefined, ...over })

describe('isDustTx', () => {
	test('entrada minúscula con precio conocido = dust; el umbral es en USD', () => {
		expect(DUST_USD_THRESHOLD).toBe(0.01)
		expect(isDustTx(tx({ amount: '0.001' }), 1)).toBe(true) // 0.001 USDT
		expect(isDustTx(tx({ amount: '0.009' }), 1)).toBe(true)
		expect(isDustTx(tx({ amount: '0.01' }), 1)).toBe(false)
		expect(isDustTx(tx({ amount: '0.00000001' }), 77_000)).toBe(true) // 1 sat ≈ $0.0008
		expect(isDustTx(tx({ amount: '0.001' }), 77_000)).toBe(false) // $77
	})

	test('nunca lo saliente, las comisiones ni lo que no tiene precio', () => {
		expect(isDustTx(tx({ direction: 'out', amount: '0.000001' }), 1)).toBe(false)
		expect(isDustTx(tx({ direction: 'self', amount: '0.000001' }), 1)).toBe(false)
		expect(isDustTx(tx({ kind: 'fee', amount: '0.000001' }), 1)).toBe(false)
		expect(isDustTx(tx({ amount: '0.000001' }), null)).toBe(false)
		expect(isDustTx(tx({ amount: '0.000001' }), 0)).toBe(false)
		expect(isDustTx(tx({ amount: 'abc' }), 1)).toBe(false)
	})
})

describe('splitDust', () => {
	test('separa conservando el orden', () => {
		const items = [tx({ amount: '5' }), tx({ amount: '0.001' }), tx({ direction: 'out', amount: '0.0001' }), tx({ amount: '0.002' })]
		const { visible, dust } = splitDust(items, 1)
		expect(visible.map(i => i.amount)).toEqual(['5', '0.0001'])
		expect(dust.map(i => i.amount)).toEqual(['0.001', '0.002'])
	})
})
