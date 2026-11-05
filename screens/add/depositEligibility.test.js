/**
 * Reglas del gate de rieles del depósito (tarjeta/PayPal) sobre `GET /user/deposit-eligibility`.
 * @jest-environment node
 */
import { filterGatedCoins, ssnCapFor, chargeTotalFor, capIssue, ssnCtaVisible, railFor } from './depositEligibility'

const rail = (eligible, tier = eligible ? 'full' : null, reason = eligible ? null : 'NOT_ELIGIBLE') => ({ eligible, tier, reason })
const tier = (over = {}) => ({ enabled: true, verified: true, cap: 500, used_30d: 0, remaining: 500, window_days: 30, resets_at: null, ...over })
const eligibility = (over = {}) => ({ channel: 'ios', card: rail(false), paypal: rail(false), bank: rail(false), ssn_tier: tier(), ...over })

const CARD = { tick: 'CARD', name: 'Tarjeta' }
const PAYPAL = { tick: 'PAYPAL', name: 'PayPal' }
const USDT = { tick: 'USDT', name: 'Tether' }
const BANK = { tick: 'BANK', name: 'Transferencia' }

describe('railFor', () => {
	test('solo CARD y PAYPAL se gatean (y sin importar mayúsculas)', () => {
		expect(railFor('CARD')).toBe('card')
		expect(railFor('paypal')).toBe('paypal')
		expect(railFor('USDT')).toBeNull()
		expect(railFor('BANK')).toBeNull()
		expect(railFor(null)).toBeNull()
	})
})

describe('filterGatedCoins', () => {
	const catalog = [CARD, USDT, PAYPAL, BANK]

	test('sin respuesta se quitan las gateadas y el resto queda igual', () => {
		expect(filterGatedCoins(catalog, null)).toEqual([USDT, BANK])
		expect(filterGatedCoins(catalog, undefined)).toEqual([USDT, BANK])
	})

	test('cada riel sigue a su `eligible`', () => {
		expect(filterGatedCoins(catalog, eligibility({ card: rail(true) }))).toEqual([CARD, USDT, BANK])
		expect(filterGatedCoins(catalog, eligibility({ paypal: rail(true, 'ssn') }))).toEqual([USDT, PAYPAL, BANK])
	})

	test('devuelve la misma referencia cuando no hay nada que quitar', () => {
		const all = eligibility({ card: rail(true), paypal: rail(true) })
		expect(filterGatedCoins(catalog, all)).toBe(catalog)
		const plain = [USDT, BANK]
		expect(filterGatedCoins(plain, null)).toBe(plain)
	})
})

describe('ssnCapFor', () => {
	test('solo con tier ssn en ESE riel', () => {
		const e = eligibility({ card: rail(true, 'ssn'), paypal: rail(true, 'full'), ssn_tier: tier({ remaining: 320.5, resets_at: '2026-12-01T00:00:00Z' }) })
		expect(ssnCapFor(e, 'CARD')).toEqual({ cap: 500, remaining: 320.5, resetsAt: '2026-12-01T00:00:00Z' })
		expect(ssnCapFor(e, 'PAYPAL')).toBeNull()
		expect(ssnCapFor(e, 'USDT')).toBeNull()
		expect(ssnCapFor(null, 'CARD')).toBeNull()
	})

	test('un remaining negativo del servidor se acota a 0', () => {
		const e = eligibility({ card: rail(true, 'ssn'), ssn_tier: tier({ remaining: -3 }) })
		expect(ssnCapFor(e, 'CARD').remaining).toBe(0)
	})
})

describe('chargeTotalFor', () => {
	test('CARD con fee aparte cuenta el bruto; incluido o PayPal, el importe', () => {
		expect(chargeTotalFor({ tick: 'CARD', amount: '100', feeMode: 'on_top', feeRate: 6 })).toBe(106)
		expect(chargeTotalFor({ tick: 'CARD', amount: '100', feeMode: 'included', feeRate: 6 })).toBe(100)
		expect(chargeTotalFor({ tick: 'PAYPAL', amount: '100', feeMode: 'on_top', feeRate: 6 })).toBe(100)
	})

	test('importes inválidos valen 0', () => {
		expect(chargeTotalFor({ tick: 'CARD', amount: '', feeMode: 'on_top', feeRate: 6 })).toBe(0)
		expect(chargeTotalFor({ tick: 'CARD', amount: 'abc', feeMode: 'on_top', feeRate: 6 })).toBe(0)
	})
})

describe('capIssue', () => {
	test('sin cupo = null; agotado gana a excedido', () => {
		expect(capIssue(1000, null)).toBeNull()
		expect(capIssue(10, { cap: 500, remaining: 0, resetsAt: null })).toBe('exhausted')
		expect(capIssue(0, { cap: 500, remaining: 0, resetsAt: null })).toBe('exhausted')
	})

	test('excede solo por encima de lo que queda', () => {
		const cap = { cap: 500, remaining: 106, resetsAt: null }
		expect(capIssue(106, cap)).toBeNull()
		expect(capIssue(106.01, cap)).toBe('exceeds')
	})
})

describe('ssnCtaVisible', () => {
	const ssn = (over = {}) => ({ status: 'none', verified_at: null, attempts_left: 3, attempts_max: 3, can_start: true, block_reason: null, message: null, ...over })
	const cip = (over = {}) => ({ us_person: true, ssn_itin_last4: '1234', cip_status: 'complete', ssn_verification: ssn(), ...over })

	test('persona de EE. UU. sin rieles y que puede verificar', () => {
		expect(ssnCtaVisible(eligibility(), cip())).toBe(true)
	})

	test('también si solo le falta GOLD', () => {
		expect(ssnCtaVisible(eligibility(), cip({ ssn_verification: ssn({ can_start: false, block_reason: 'GOLD_REQUIRED' }) }))).toBe(true)
	})

	test('no: ya tiene algún riel, no es US person, ya está verificado o el nivel está apagado', () => {
		expect(ssnCtaVisible(eligibility({ card: rail(true) }), cip())).toBe(false)
		expect(ssnCtaVisible(eligibility(), cip({ us_person: false }))).toBe(false)
		expect(ssnCtaVisible(eligibility({ card: rail(false, null, 'SSN_TIER_OFF') }), cip({ ssn_verification: ssn({ status: 'verified', can_start: false }) }))).toBe(false)
		expect(ssnCtaVisible(eligibility(), cip({ ssn_verification: ssn({ can_start: false, block_reason: 'KYC_REQUIRED' }) }))).toBe(false)
	})

	test('sin datos no se ofrece', () => {
		expect(ssnCtaVisible(null, cip())).toBe(false)
		expect(ssnCtaVisible(eligibility(), null)).toBe(false)
	})
})

describe('copy del cupo', () => {
	const { formatCapAmount, formatCapDate } = require('./depositEligibility')

	test('importes sin ceros muertos', () => {
		expect(formatCapAmount(500)).toBe('500')
		expect(formatCapAmount(320.5)).toBe('320.5')
		expect(formatCapAmount(106.014)).toBe('106.01')
		expect(formatCapAmount(0)).toBe('0')
	})

	test('fecha corta en el idioma activo (es en los tests) y vacía sin dato', () => {
		expect(formatCapDate('2026-12-01T12:00:00Z')).toMatch(/1.*dic/)
		expect(formatCapDate(null)).toBe('')
		expect(formatCapDate('nope')).toBe('')
	})
})
