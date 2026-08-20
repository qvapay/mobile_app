/**
 * Tests del gate cliente de depósito con tarjeta — espejo de
 * `isCardDepositEligible` del backend (menos la geolocalización, que solo el
 * servidor conoce).
 * @jest-environment node
 */
import { isCardDepositEligible, filterCardFromCatalog, CARD_MIN_ACCOUNT_DAYS } from './cardDepositEligibility'

const DAY_MS = 86_400_000
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString()

// Usuario que cumple todo el criterio por trustscore
const eligibleUser = {
	kyc: true,
	telegram_id: '12345',
	phone_verified: true,
	created_at: daysAgo(60),
	vip: false,
	trustscore: 95,
}

describe('isCardDepositEligible', () => {
	test('acepta al usuario que cumple todo el criterio', () => {
		expect(isCardDepositEligible(eligibleUser)).toBe(true)
	})

	test('VIP sustituye al trustscore', () => {
		expect(isCardDepositEligible({ ...eligibleUser, trustscore: 0, vip: true })).toBe(true)
	})

	test.each([
		['sin usuario', null],
		['sin KYC', { ...eligibleUser, kyc: false }],
		['sin Telegram', { ...eligibleUser, telegram_id: null }],
		['sin teléfono verificado', { ...eligibleUser, phone_verified: false }],
		['cuenta demasiado nueva', { ...eligibleUser, created_at: daysAgo(CARD_MIN_ACCOUNT_DAYS - 1) }],
		['sin fecha de creación', { ...eligibleUser, created_at: null }],
		['fecha inválida', { ...eligibleUser, created_at: 'garbage' }],
		['ni VIP ni trustscore suficiente', { ...eligibleUser, trustscore: 90, vip: false }],
	])('rechaza: %s', (_, user) => {
		expect(isCardDepositEligible(user)).toBe(false)
	})

	test('trustscore ausente cuenta como 0', () => {
		expect(isCardDepositEligible({ ...eligibleUser, trustscore: undefined })).toBe(false)
	})
})

describe('filterCardFromCatalog', () => {
	const CARD = { tick: 'CARD', name: 'Tarjeta' }
	const USDT = { tick: 'USDT', name: 'Tether' }
	const catalog = [
		{ name: 'Fiat', coins: [CARD] },
		{ name: 'Cripto', coins: [USDT, CARD] },
	]

	test('elegible: devuelve el catálogo intacto (misma referencia)', () => {
		expect(filterCardFromCatalog(catalog, true)).toBe(catalog)
	})

	test('no elegible: quita CARD y elimina grupos vacíos', () => {
		const filtered = filterCardFromCatalog(catalog, false)
		expect(filtered).toEqual([{ name: 'Cripto', coins: [USDT] }])
	})

	test('sin CARD en el catálogo: misma referencia (no rerenders)', () => {
		const clean = [{ name: 'Cripto', coins: [USDT] }]
		expect(filterCardFromCatalog(clean, false)).toBe(clean)
	})
})
