/**
 * @jest-environment node
 */
import { DUST_USD_THRESHOLD, isDustTx, isZeroTransfer, splitDust } from './dust'

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

// R-04: un `transferFrom(víctima, parecida, 0)` no necesita permiso de nadie y deja en el
// historial de la víctima un «Enviado 0 USDT» a una dirección que imita a una suya
describe('transferencias de importe cero', () => {
	test('cualquiera es polvo: entrante, SALIENTE o a uno mismo, con precio o sin él', () => {
		for (const direction of ['in', 'out', 'self']) {
			expect(isDustTx(tx({ direction, amount: '0' }), 1)).toBe(true)
			expect(isDustTx(tx({ direction, amount: '0.000000' }), null)).toBe(true)
			expect(isZeroTransfer(tx({ direction, amount: '0' }))).toBe(true)
		}
	})

	test('lo que no es una transferencia no cuenta: comisiones y movimientos de staking', () => {
		for (const kind of ['fee', 'stake', 'unstake', 'vote', 'claim', 'withdraw']) {
			expect(isZeroTransfer(tx({ kind, amount: '0' }))).toBe(false)
			expect(isDustTx(tx({ kind, direction: 'out', amount: '0' }), 1)).toBe(false)
		}
		expect(isZeroTransfer(tx({ kind: 'transfer', amount: '0' }))).toBe(true)
	})

	test('con importe, por pequeño que sea, lo saliente sigue a la vista; y un importe ilegible no es cero', () => {
		expect(isZeroTransfer(tx({ direction: 'out', amount: '0.000001' }))).toBe(false)
		expect(isDustTx(tx({ direction: 'out', amount: '0.000001' }), 1)).toBe(false)
		expect(isZeroTransfer(tx({ amount: 'abc' }))).toBe(false)
	})

	test('se van con el polvo al separar el historial', () => {
		const items = [tx({ direction: 'out', amount: '25' }), tx({ direction: 'out', amount: '0' }), tx({ direction: 'in', amount: '10' })]
		const { visible, dust } = splitDust(items, null)
		expect(visible.map(item => item.amount)).toEqual(['25', '10'])
		expect(dust.map(item => item.amount)).toEqual(['0'])
	})
})
