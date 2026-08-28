/**
 * Unit tests del enrutado de pushes: los tipos REALES que manda el backend
 * (`transfer_received`, `p2p_applied`, `cart_stage`…) y los legacy.
 * @jest-environment node
 */
import { isMoneyInPush, isMoneySoundPush, pushTransactionUuid, resolvePushTarget } from './pushRouting'

describe('isMoneyInPush', () => {

	test('el cobro del backend y los tipos legacy suenan a moneda', () => {
		expect(isMoneyInPush({ type: 'transfer_received' })).toBe(true)
		expect(isMoneyInPush({ type: 'transaction' })).toBe(true)
		expect(isMoneyInPush({ type: 'transfer' })).toBe(true)
	})

	test('los fondos recibidos de un P2P también', () => {
		expect(isMoneyInPush({ type: 'p2p_completed' })).toBe(true)
		expect(isMoneyInPush({ type: 'p2p_partial_completed' })).toBe(true)
	})

	test('lo que sale de la cuenta, o no es dinero, no', () => {
		expect(isMoneyInPush({ type: 'transfer_sent' })).toBe(false)
		expect(isMoneyInPush({ type: 'p2p_chat' })).toBe(false)
		expect(isMoneyInPush(undefined)).toBe(false)
	})
})

describe('isMoneySoundPush', () => {

	test('entradas y salidas comparten los canales con sonido de moneda', () => {
		expect(isMoneySoundPush({ type: 'transfer_received' })).toBe(true)
		expect(isMoneySoundPush({ type: 'transfer_sent' })).toBe(true)
		expect(isMoneySoundPush({ type: 'invite_sent' })).toBe(true)
		expect(isMoneySoundPush({ type: 'p2p_chat' })).toBe(false)
	})
})

describe('pushTransactionUuid', () => {

	test('lee la clave del backend y cae al uuid legacy', () => {
		expect(pushTransactionUuid({ transaction_uuid: 't-1' })).toBe('t-1')
		expect(pushTransactionUuid({ uuid: 't-2' })).toBe('t-2')
		expect(pushTransactionUuid({})).toBeUndefined()
	})
})

describe('resolvePushTarget', () => {

	test('una transferencia lleva a su detalle', () => {
		expect(resolvePushTarget({ type: 'transfer_received', transaction_uuid: 't-1' }))
			.toEqual({ screen: 'Transaction', params: { uuid: 't-1' } })
		expect(resolvePushTarget({ type: 'transfer_sent', transaction_uuid: 't-1' }))
			.toEqual({ screen: 'Transaction', params: { uuid: 't-1' } })
	})

	test('sin uuid, al histórico', () => {
		expect(resolvePushTarget({ type: 'transfer' })).toEqual({ screen: 'Transactions' })
	})

	test('cualquier evento p2p lleva a la oferta, aunque sea dinero entrante', () => {
		expect(resolvePushTarget({ type: 'p2p_partial_paid', p2p_uuid: 'p-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1' } })
		expect(resolvePushTarget({ type: 'p2p_completed', p2p_uuid: 'p-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1' } })
		expect(resolvePushTarget({ type: 'p2p_chat' })).toBeNull()
	})

	test('carrito, gold y ahorros tienen su pantalla', () => {
		expect(resolvePushTarget({ type: 'cart_message', cart_id: 7 })).toEqual({ screen: 'AssistedCart' })
		expect(resolvePushTarget({ type: 'gold_expired' })).toEqual({ screen: 'GoldCheck' })
		expect(resolvePushTarget({ type: 'savings_debt' })).toEqual({ screen: 'Savings' })
	})

	test('un tipo desconocido no navega a ninguna parte', () => {
		expect(resolvePushTarget({ type: 'promo' })).toBeNull()
		expect(resolvePushTarget(undefined)).toBeNull()
	})
})
