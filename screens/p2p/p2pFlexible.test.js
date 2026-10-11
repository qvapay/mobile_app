/**
 * Ofertas P2P por rango: validación de la parte a tomar, proyección de una
 * orden como oferta fixed, cancelar vs disputa y edición del maker.
 * Los casos de QA de la guía del backend (venta $10, rango 2–5) están fijados aquí.
 * @jest-environment node
 */
import {
	checkTakeAmount, takeBounds, quoteReceive, findActiveOrder, projectOrder,
	orderCancelKind, checkCreateRange, checkFlexibleEdit, availableReceive, offerAvailableCents,
} from './p2pFlexible'

const SELL = {
	uuid: 'o1', type: 'sell', status: 'open', coin: 'BANK_CUP',
	amount: '10.00', receive: '5000', offer_kind: 'flexible',
	available_amount: '10.00', reserved_amount: '0.00', order_min: '2.00', order_max: '5.00',
	User: { uuid: 'maker' }, Peer: {}, only_vip: 0, private: 0, created_at: '',
}

describe('checkTakeAmount', () => {

	test('fuera del rango: bajo el mínimo y sobre el máximo (QA 2)', () => {
		expect(checkTakeAmount('1', SELL)).toEqual({ ok: false, reason: 'belowMin' })
		expect(checkTakeAmount('6', SELL)).toEqual({ ok: false, reason: 'aboveMax' })
	})

	test('dentro del rango, con coma decimal', () => {
		expect(checkTakeAmount('4,5', SELL)).toEqual({ ok: true, cents: 450, amount: 4.5 })
	})

	test('el tope es el disponible cuando queda menos que el máximo', () => {
		const offer = { ...SELL, available_amount: '3.00' }
		expect(takeBounds(offer)).toEqual({ minCents: 200, maxCents: 300 })
		expect(checkTakeAmount('4', offer)).toEqual({ ok: false, reason: 'aboveMax' })
	})

	test('más de dos decimales, cero y vacío', () => {
		expect(checkTakeAmount('2.555', SELL)).toEqual({ ok: false, reason: 'invalid' })
		expect(checkTakeAmount('0', SELL)).toEqual({ ok: false, reason: 'invalid' })
		expect(checkTakeAmount('', SELL)).toEqual({ ok: false, reason: 'empty' })
	})

	test('en una compra el monto sale del saldo del taker; en una venta no', () => {
		const buy = { ...SELL, type: 'buy' }
		expect(checkTakeAmount('3', buy, 2)).toEqual({ ok: false, reason: 'insufficientBalance' })
		expect(checkTakeAmount('3', buy, 3)).toMatchObject({ ok: true })
		expect(checkTakeAmount('3', SELL, 0)).toMatchObject({ ok: true })
	})
})

describe('montos', () => {

	test('la contrapartida usa la tasa de la oferta (receive / amount)', () => {
		expect(quoteReceive(4, SELL)).toBe(2000)
	})

	test('el disponible de una fixed es su total', () => {
		expect(offerAvailableCents({ ...SELL, offer_kind: 'fixed', available_amount: null })).toBe(1000)
		expect(offerAvailableCents({ ...SELL, available_amount: '6.00' })).toBe(600)
	})

	test('lo que se recibe por el disponible', () => {
		expect(availableReceive({ ...SELL, available_amount: '6.00' })).toBe(3000)
	})
})

describe('órdenes', () => {

	const order = (status, extra = {}) => ({ uuid: `ord-${status}`, amount: '4.00', receive: '2000', status, created_at: '', tx_id: 'TX', payment_window_expires_at: '2026-10-10T18:15:00.000Z', Taker: { uuid: 'taker' }, ...extra })

	test('la orden activa ignora las terminadas', () => {
		expect(findActiveOrder([order('completed'), order('paid')]).uuid).toBe('ord-paid')
		expect(findActiveOrder([order('cancelled')])).toBeNull()
		expect(findActiveOrder(undefined)).toBeNull()
	})

	test('la proyección pinta la orden como una oferta fixed con el taker de Peer', () => {
		const p = projectOrder(SELL, order('processing'))
		expect(p).toMatchObject({ uuid: 'o1', status: 'processing', amount: '4.00', receive: '2000', tx_id: 'TX', User: { uuid: 'maker' }, Peer: { uuid: 'taker' } })
		expect(p.payment_window_expires_at).toBe('2026-10-10T18:15:00.000Z')
	})

	test('venta: el taker paga y cancela; el dueño abre disputa (QA 5 y 6)', () => {
		expect(orderCancelKind({ offerType: 'sell', isOwner: false, status: 'processing' })).toBe('cancel')
		expect(orderCancelKind({ offerType: 'sell', isOwner: true, status: 'paid' })).toBe('dispute')
	})

	test('compra: paga el dueño, el taker abre disputa', () => {
		expect(orderCancelKind({ offerType: 'buy', isOwner: true, status: 'processing' })).toBe('cancel')
		expect(orderCancelKind({ offerType: 'buy', isOwner: false, status: 'processing' })).toBe('dispute')
	})

	test('en revisión: quien paga aún puede cancelar, la disputa no se repite', () => {
		expect(orderCancelKind({ offerType: 'sell', isOwner: false, status: 'revision' })).toBe('cancel')
		expect(orderCancelKind({ offerType: 'sell', isOwner: true, status: 'revision' })).toBeNull()
	})

	test('una orden terminada no se cancela', () => {
		expect(orderCancelKind({ offerType: 'sell', isOwner: false, status: 'completed' })).toBeNull()
	})
})

describe('checkCreateRange', () => {

	test('rango válido', () => {
		expect(checkCreateRange(10, '2', '5')).toEqual({ ok: true, order_min: 2, order_max: 5 })
	})

	test('mínimo sobre máximo y máximo sobre el total', () => {
		expect(checkCreateRange(10, '6', '5')).toEqual({ ok: false, reason: 'minAboveMax' })
		expect(checkCreateRange(10, '2', '11')).toEqual({ ok: false, reason: 'maxAboveAmount' })
	})

	test('vacíos o no positivos', () => {
		expect(checkCreateRange(10, '', '5')).toEqual({ ok: false, reason: 'minInvalid' })
		expect(checkCreateRange(10, '2', '0')).toEqual({ ok: false, reason: 'maxInvalid' })
	})
})

describe('checkFlexibleEdit', () => {

	// Venta de $10 con $4 tomados: quedan $6
	const taken = { ...SELL, available_amount: '6.00', reserved_amount: '4.00' }

	test('subir el disponible en una venta descuenta la diferencia del saldo', () => {
		const r = checkFlexibleEdit(taken, { available: '8', receive: '4000', order_min: '2', order_max: '5' }, 100)
		expect(r).toEqual({ ok: true, payload: { available_amount: 8, receive: 4000, order_min: 2, order_max: 5 }, escrowDeltaCents: 200 })
	})

	test('sin saldo para la diferencia no se guarda', () => {
		expect(checkFlexibleEdit(taken, { available: '8', receive: '', order_min: '', order_max: '' }, 1)).toEqual({ ok: false, reason: 'insufficientBalance' })
	})

	test('bajar el disponible lo devuelve; en una compra no hay garantía del maker', () => {
		expect(checkFlexibleEdit(taken, { available: '3', receive: '', order_min: '', order_max: '' }).escrowDeltaCents).toBe(-300)
		expect(checkFlexibleEdit({ ...taken, type: 'buy' }, { available: '8', receive: '', order_min: '', order_max: '' }, 0).escrowDeltaCents).toBe(0)
	})

	test('disponible 0 retira el resto y omite receive', () => {
		const r = checkFlexibleEdit(taken, { available: '0', receive: '3000', order_min: '', order_max: '' })
		expect(r).toEqual({ ok: true, payload: { available_amount: 0, order_min: 2, order_max: 5 }, escrowDeltaCents: -600 })
	})

	test('un disponible bajo el mínimo por orden no vale (salvo 0)', () => {
		expect(checkFlexibleEdit(taken, { available: '1', receive: '', order_min: '', order_max: '' })).toEqual({ ok: false, reason: 'availableBelowMin' })
	})

	test('sin nada tomado, retirar todo es cancelar', () => {
		expect(checkFlexibleEdit(SELL, { available: '0', receive: '', order_min: '', order_max: '' })).toEqual({ ok: false, reason: 'nothingTaken' })
	})
})
