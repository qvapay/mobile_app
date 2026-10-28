/**
 * Unit tests del enrutado de pushes: los tipos REALES que manda el backend
 * (`transfer_received`, `p2p_applied`, `cart_stage`…) y los legacy.
 * @jest-environment node
 */
import { isMoneyInPush, isMoneySoundPush, pushTransactionUuid, resolvePushNavigation, resolvePushTarget } from './pushRouting'
import { ROUTES } from '../routes'

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
		// Comentario en una transacción (qpweb manda solo type + transaction_uuid, sin deeplink)
		expect(resolvePushTarget({ type: 'transaction_comment', transaction_uuid: 't-1' }))
			.toEqual({ screen: 'Transaction', params: { uuid: 't-1' } })
		expect(isMoneySoundPush({ type: 'transaction_comment' })).toBe(false)
	})

	test('sin uuid, al histórico', () => {
		expect(resolvePushTarget({ type: 'transfer' })).toEqual({ screen: 'Transactions' })
	})

	test('las push de una orden por rango abren esa orden; "tomaron una parte" abre la oferta', () => {
		expect(resolvePushTarget({ type: 'p2p_partial_paid', p2p_uuid: 'p-1', order_uuid: 'o-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', order: 'o-1' } })
		expect(resolvePushTarget({ type: 'p2p_partial_revision', p2p_uuid: 'p-1', order_uuid: 'o-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', order: 'o-1' } })
		expect(resolvePushTarget({ type: 'p2p_partial_applied', p2p_uuid: 'p-1', order_uuid: 'o-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1' } })
	})

	test('cualquier evento p2p lleva a la oferta, aunque sea dinero entrante', () => {
		expect(resolvePushTarget({ type: 'p2p_partial_paid', p2p_uuid: 'p-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1' } })
		expect(resolvePushTarget({ type: 'p2p_applied', p2p_uuid: 'p-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1' } })
		expect(resolvePushTarget({ type: 'p2p_chat' })).toBeNull()
	})

	test('un trato cerrado abre el detalle pidiendo la valoración (rate)', () => {
		expect(resolvePushTarget({ type: 'p2p_completed', p2p_uuid: 'p-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', rate: true } })
		expect(resolvePushTarget({ type: 'p2p_partial_completed', p2p_uuid: 'p-1', order_uuid: 'o-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', order: 'o-1', rate: true } })
	})

	test('una disputa resuelta solo pide valorar si se liberó', () => {
		expect(resolvePushTarget({ type: 'p2p_partial_dispute_resolved', p2p_uuid: 'p-1', order_uuid: 'o-1', resolution: 'released' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', order: 'o-1', rate: true } })
		expect(resolvePushTarget({ type: 'p2p_partial_dispute_resolved', p2p_uuid: 'p-1', order_uuid: 'o-1', resolution: 'cancelled' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-1', order: 'o-1' } })
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

describe('puesto promocionado', () => {
	test.each(['p2p_promo_outbid', 'p2p_promo_won', 'p2p_promo_expired', 'p2p_promo_ending'])('%s abre la pantalla del puesto aunque no traiga p2p_uuid', (type) => {
		expect(resolvePushTarget({ type })).toEqual({ screen: ROUTES.P2P_PROMOTE, params: {} })
	})

	test('si la push trae el par, abre ese par', () => {
		expect(resolvePushTarget({ type: 'p2p_promo_outbid', coin: 'BANK_CUP', offer_type: 'sell' })).toEqual({ screen: ROUTES.P2P_PROMOTE, params: { coin: 'BANK_CUP', type: 'sell' } })
		expect(resolvePushTarget({ type: 'p2p_promo_won', coin: 'CLASICA', offer_type: 'nope' })).toEqual({ screen: ROUTES.P2P_PROMOTE, params: { coin: 'CLASICA' } })
	})

	test('no es dinero entrante ni suena a moneda', () => {
		expect(isMoneyInPush({ type: 'p2p_promo_won' })).toBe(false)
		expect(isMoneySoundPush({ type: 'p2p_promo_outbid' })).toBe(false)
	})
})

describe('resolvePushNavigation', () => {
	test('el deeplink del backend manda sobre el tipo', () => {
		expect(resolvePushNavigation({ type: 'transfer_received', transaction_uuid: 't-1', deeplink: 'https://www.qvapay.com/savings' }))
			.toEqual({ screen: 'Savings', params: undefined })
		expect(resolvePushNavigation({ type: 'promo', deeplink: 'qvapay://p2p/p-9?order=o-1' }))
			.toEqual({ screen: 'P2POffer', params: { p2p_uuid: 'p-9', order: 'o-1' } })
	})

	test('un deeplink que la app no sabe abrir cae al enrutado por tipo', () => {
		expect(resolvePushNavigation({ type: 'transfer_received', transaction_uuid: 't-1', deeplink: 'https://www.qvapay.com/blog/post' }))
			.toEqual({ screen: 'Transaction', params: { uuid: 't-1' } })
		expect(resolvePushNavigation({ type: 'promo', deeplink: 'https://evil.com/pay/x' })).toBeNull()
		expect(resolvePushNavigation(undefined)).toBeNull()
	})
})
