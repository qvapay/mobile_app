/**
 * Reglas del puesto promocionado del mercado P2P (espejo de promo-rules.js de qpweb).
 * @jest-environment node
 */
import {
	classifyPromoError, defaultPromoCoin, freeSlotFor, parseBid, promoBlock, promoEligible,
	promoPrice, promoTypeOf, promoUsd, slotFor, slotStatus, withoutPromoted,
} from './p2pPromo'

const FREE = { coin: 'BANK_CUP', offer_type: 'buy', state: 'free', holder: null, starts_at: null, ends_at: null, leading_amount: null, min_bid: 5, start_price: 5, period_days: 30 }
const HELD = { coin: 'BANK_CUP', offer_type: 'sell', state: 'held', holder: { uuid: 'u-holder', username: 'comerciante' }, starts_at: '2026-10-16T12:00:00.000Z', ends_at: '2026-11-15T12:00:00.000Z', leading_amount: 25, min_bid: 27.5, start_price: 5, period_days: 30 }
const PAYLOAD = { coin: 'BANK_CUP', enabled: true, slots: [HELD, FREE], rules: null, eligibility: { ok: true, missing: [] } }

describe('listado', () => {
	test('la oferta promocionada no se repite en su posición del ranking', () => {
		const offers = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }]
		expect(withoutPromoted(offers, { slot: HELD, offer: { uuid: 'b' } }).map(o => o.uuid)).toEqual(['a', 'c'])
	})

	test('sin puesto el listado queda igual (misma referencia)', () => {
		const offers = [{ uuid: 'a' }]
		expect(withoutPromoted(offers, null)).toBe(offers)
	})

	test('el puesto libre de un lado se anuncia; el ocupado no', () => {
		expect(freeSlotFor(PAYLOAD, 'buy')).toBe(FREE)
		expect(freeSlotFor(PAYLOAD, 'sell')).toBeNull()
	})

	test('con la función apagada no hay puestos', () => {
		expect(slotFor({ ...PAYLOAD, enabled: false }, 'sell')).toBeNull()
		expect(freeSlotFor(null, 'buy')).toBeNull()
	})
})

describe('estado y precio', () => {
	test('el titular se reconoce por uuid', () => {
		expect(slotStatus(HELD, 'u-holder')).toBe('mine')
		expect(slotStatus(HELD, 'otro')).toBe('taken')
		expect(slotStatus(HELD, null)).toBe('taken')
		expect(slotStatus(FREE, 'u-holder')).toBe('free')
		expect(slotStatus({ ...HELD, state: 'rotating' }, 'u-holder')).toBe('rotating')
	})

	test('libre cobra el precio de salida aunque se teclee otra cosa; ocupado cobra la puja', () => {
		expect(promoPrice(FREE, '99')).toBe(5)
		expect(promoPrice(HELD, '30,5')).toBe(30.5)
	})

	test('la puja se lee a centavos y vacío no es cero', () => {
		expect(parseBid('27.499')).toBe(27.5)
		expect(parseBid('')).toBeNaN()
		expect(parseBid('abc')).toBeNaN()
	})

	test('tipo de la ruta solo si es un lado válido', () => {
		expect(promoTypeOf('sell')).toBe('sell')
		expect(promoTypeOf('SELL')).toBeUndefined()
		expect(promoTypeOf(undefined)).toBeUndefined()
	})
})

describe('cuándo se puede comprar o pujar', () => {
	const base = { bidText: '30', balance: 100, eligible: true, leadingMine: false }

	test('adelante con todo en orden', () => {
		expect(promoBlock({ slot: HELD, ...base })).toBeNull()
		expect(promoBlock({ slot: FREE, ...base, bidText: '' })).toBeNull()
	})

	test('en rotación no se puede nada', () => {
		expect(promoBlock({ slot: { ...HELD, state: 'rotating' }, ...base })).toBe('rotating')
	})

	test('sin la reputación o el P2P activo, bloqueado', () => {
		expect(promoBlock({ slot: FREE, ...base, eligible: false })).toBe('ineligible')
	})

	test('no se sube la propia puja mientras va ganando (un puesto libre sí se compra)', () => {
		expect(promoBlock({ slot: HELD, ...base, leadingMine: true })).toBe('leading')
		expect(promoBlock({ slot: FREE, ...base, leadingMine: true })).toBeNull()
	})

	test('puja por debajo del mínimo o vacía', () => {
		expect(promoBlock({ slot: HELD, ...base, bidText: '27.49' })).toBe('invalidBid')
		expect(promoBlock({ slot: HELD, ...base, bidText: '' })).toBe('invalidBid')
		expect(promoBlock({ slot: HELD, ...base, bidText: '27.5' })).toBeNull()
	})

	test('saldo insuficiente', () => {
		expect(promoBlock({ slot: HELD, ...base, balance: '29.99' })).toBe('balance')
		expect(promoBlock({ slot: FREE, ...base, balance: 4 })).toBe('balance')
	})

	test('elegible = P2P activo con KYC y sin requisitos pendientes', () => {
		expect(promoEligible({ kyc: 1, p2p_enabled: 1 }, PAYLOAD)).toBe(true)
		expect(promoEligible({ kyc: 0, p2p_enabled: 1 }, PAYLOAD)).toBe(false)
		expect(promoEligible({ kyc: 1, p2p_enabled: 1 }, { ...PAYLOAD, eligibility: { ok: false, missing: [] } })).toBe(false)
	})
})

describe('errores del servidor', () => {
	test('precio cambiado trae el nuevo mínimo y el puesto vigente', () => {
		const slot = { ...HELD, min_bid: 33 }
		expect(classifyPromoError({ status: 409, details: { code: 'PROMO_PRICE_CHANGED', min: 33, slot } })).toEqual({ kind: 'priceChanged', min: 33, slot })
	})

	test('cada código a su clase', () => {
		expect(classifyPromoError({ details: { code: 'ALREADY_LEADING' } }).kind).toBe('alreadyLeading')
		expect(classifyPromoError({ details: { code: 'INSUFFICIENT_BALANCE' } }).kind).toBe('balance')
		expect(classifyPromoError({ details: { code: 'PROMO_REQUIREMENTS_NOT_MET' } }).kind).toBe('requirements')
		expect(classifyPromoError({ details: { code: 'PROMO_RETRY' } }).kind).toBe('retry')
		expect(classifyPromoError({ details: { code: 'PROMO_DISABLED' } }).kind).toBe('disabled')
		expect(classifyPromoError({ status: 429 }).kind).toBe('rateLimited')
		expect(classifyPromoError({ status: 500 }).kind).toBe('generic')
	})
})

describe('moneda inicial', () => {
	test('la pedida si existe, o mientras el catálogo no ha cargado', () => {
		expect(defaultPromoCoin('clasica', ['BANK_CUP', 'CLASICA'])).toBe('CLASICA')
		expect(defaultPromoCoin('CLASICA', [])).toBe('CLASICA')
	})

	test('si no, BANK_CUP como la web, o la primera', () => {
		expect(defaultPromoCoin('NOPE', ['ETECSA', 'BANK_CUP'])).toBe('BANK_CUP')
		expect(defaultPromoCoin(null, ['ETECSA'])).toBe('ETECSA')
		expect(defaultPromoCoin(null, [])).toBeNull()
	})
})

test('importes en USD sin decimales de sobra', () => {
	expect(promoUsd(5)).toBe('5')
	expect(promoUsd('27.5')).toBe('27.50')
	expect(promoUsd(null)).toBe('0')
})
