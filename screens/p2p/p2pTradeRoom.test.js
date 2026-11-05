/**
 * Tests for the pure trade-room rules: who is buying from the viewer's side, the
 * amount in the screen title and the timeline steps per role and status — with
 * the real Spanish i18n singleton from jest.setup.js.
 * @jest-environment node
 */
import i18n from '../../i18n'
import { buildTradeTimeline, isTradeRoomStatus, tradeHeaderModel } from './p2pTradeRoom'

const t = i18n.t.bind(i18n)

const OFFER = {
	type: 'sell',
	amount: '3.19',
	receive: '3353.39',
	coin: 'BANK_CUP',
	Coin: { logo: 'cup', name: 'CUP' },
}

const VARS = { amount: '3353.39', coin: 'CUP', balance: '3.19', counterparty: '@peer' }

describe('isTradeRoomStatus', () => {
	test('only a deal in progress has a trade room', () => {
		expect(['processing', 'paid', 'completed'].every(isTradeRoomStatus)).toBe(true)
		expect(['open', 'cancelled', 'revision'].some(isTradeRoomStatus)).toBe(false)
	})
})

describe('tradeHeaderModel', () => {
	test('the side is what the viewer does: the taker of a sell offer buys', () => {
		expect(tradeHeaderModel(OFFER, false, false).side).toBe('buy')
		expect(tradeHeaderModel(OFFER, true, false).side).toBe('sell')
	})

	test('the taker of a buy offer sells and its owner buys', () => {
		const offer = { ...OFFER, type: 'buy' }
		expect(tradeHeaderModel(offer, false, false).side).toBe('sell')
		expect(tradeHeaderModel(offer, true, false).side).toBe('buy')
	})

	test('keeps the rail amount exactly as it travels', () => {
		const model = tradeHeaderModel({ ...OFFER, receive: '0.00012345' }, false, false)
		expect(model.amount).toBe('0.00012345')
	})

	test('carries the coin logo and name, falling back to the tick', () => {
		expect(tradeHeaderModel(OFFER, false, false)).toMatchObject({ coinLogo: 'cup', coinName: 'CUP' })
		const { Coin, ...bare } = OFFER
		expect(tradeHeaderModel(bare, false, false)).toMatchObject({ coinLogo: 'BANK_CUP', coinName: 'BANK_CUP' })
	})

	describe('range offers', () => {
		const RANGE = { ...OFFER, offer_kind: 'flexible', amount: '100.00', receive: '40000', available_amount: '25.00' }

		test('the overview shows what is left, not the original total', () => {
			expect(tradeHeaderModel(RANGE, false, true).amount).toBe('10000')
		})

		test('an order keeps its own amount', () => {
			expect(tradeHeaderModel(RANGE, false, false).amount).toBe('40000')
		})

		test('an overview with nothing left falls back to the total', () => {
			expect(tradeHeaderModel({ ...RANGE, available_amount: '0' }, false, true).amount).toBe('40000')
		})
	})
})

describe('buildTradeTimeline', () => {
	const timeline = (status, isPayer) => buildTradeTimeline(t, { status, isPayer, ...VARS })
	const states = (status) => timeline(status, true).map(step => step.state)

	test('always three steps in the same order', () => {
		expect(timeline('processing', true).map(step => step.key)).toEqual(['payment', 'confirmation', 'release'])
	})

	test('step states follow the offer status', () => {
		expect(states('processing')).toEqual(['active', 'pending', 'pending'])
		expect(states('paid')).toEqual(['done', 'done', 'active'])
		expect(states('completed')).toEqual(['done', 'done', 'done'])
	})

	test('both roles share the step states', () => {
		for (const status of ['processing', 'paid', 'completed']) {
			expect(timeline(status, false).map(step => step.state)).toEqual(states(status))
		}
	})

	test('the payer is told what to send and to whom', () => {
		const [payment] = timeline('processing', true)
		expect(payment.title).toBe('Realiza el pago')
		expect(payment.body).toContain('Envía 3353.39 CUP a @peer')
	})

	test('the receiver is told their balance stays on hold until they release it', () => {
		const [payment] = timeline('processing', false)
		expect(payment.title).toBe('Esperando el pago')
		expect(payment.body).toContain('Tus $3.19 quedan retenidos')
	})

	test('a paid offer is only a claim for the receiver until they release', () => {
		const [payment, , release] = timeline('paid', false)
		expect(payment.title).toBe('Pago anunciado')
		expect(payment.title).not.toBe('Pago recibido')
		expect(release.title).toBe('Verifica y libera')
	})

	test('a completed deal is told in the past for both roles', () => {
		expect(timeline('completed', true)[2].body).toBe('Recibiste $3.19 de @peer en tu saldo.')
		const received = timeline('completed', false)
		expect(received[0].title).toBe('Pago recibido')
		expect(received[2].body).toBe('Liberaste $3.19 a @peer.')
	})

	test('no step leaves an interpolation unresolved', () => {
		for (const status of ['processing', 'paid', 'completed']) {
			for (const isPayer of [true, false]) {
				for (const step of timeline(status, isPayer)) {
					expect(step.title + step.body).not.toContain('{{')
				}
			}
		}
	})
})
