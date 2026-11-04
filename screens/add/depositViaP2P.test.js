/**
 * Reglas puras del escaparate «Vía P2P» del depósito — espejo de
 * `tests/p2p-treasury-showcase.test.mjs` y `tests/p2p-requirements-rules.test.mjs`
 * de qpweb: los mismos casos, para que la app y la web compongan lo mismo.
 * @jest-environment node
 */
import {
	VIA_P2P_TICKS, VIA_P2P_TAKE, isViaP2PCoin, viaP2PCoinsFrom, composeShowcase, showcaseRequirements,
	applicantStatsFrom, evaluateRequirements, accountDaysSince, howToPayKey, marketParams,
} from './depositViaP2P'

const offer = (uuid, extra = {}) => ({ uuid, type: 'sell', coin: 'ETECSA', only_vip: 0, ...extra })

describe('monedas', () => {
	test('la lista y su orden son los de qpweb', () => {
		expect(VIA_P2P_TICKS).toEqual(['ETECSA', 'BANK_CUP', 'BANK_MLC', 'CLASICA', 'BANDECPREPAGO'])
		expect(VIA_P2P_TAKE).toBe(5)
	})

	test('solo cuenta mientras la moneda siga sin admitir depósito', () => {
		expect(isViaP2PCoin({ tick: 'ETECSA', enabled_in: 0 })).toBe(true)
		expect(isViaP2PCoin({ tick: 'ETECSA', enabled_in: false })).toBe(true)
		expect(isViaP2PCoin({ tick: 'ETECSA' })).toBe(true)
		expect(isViaP2PCoin({ tick: 'ETECSA', enabled_in: 1 })).toBe(false)
		expect(isViaP2PCoin({ tick: 'USDT', enabled_in: 0 })).toBe(false)
		expect(isViaP2PCoin(null)).toBe(false)
	})

	test('viaP2PCoinsFrom: las que faltan en el catálogo depositable, en orden, y [] estable si no hay', () => {
		const all = [
			{ tick: 'USDT', enabled_in: 1 },
			{ tick: 'CLASICA', enabled_in: 0 },
			{ tick: 'ETECSA', enabled_in: 0 },
			{ tick: 'BANK_CUP', enabled_in: 1 },
			{ tick: 'BANK_MLC', enabled_in: 0 },
		]
		expect(viaP2PCoinsFrom(all, [{ tick: 'USDT' }, { tick: 'BANK_CUP' }]).map(c => c.tick)).toEqual(['ETECSA', 'BANK_MLC', 'CLASICA'])
		// Ya listada como depositable: no se duplica
		expect(viaP2PCoinsFrom(all, [{ tick: 'BANK_MLC' }]).map(c => c.tick)).toEqual(['ETECSA', 'CLASICA'])
		expect(viaP2PCoinsFrom([{ tick: 'USDT', enabled_in: 1 }], [])).toBe(viaP2PCoinsFrom(null, []))
		expect(viaP2PCoinsFrom(undefined, undefined)).toEqual([])
	})
})

describe('composeShowcase (calco de qpweb)', () => {
	test('con tesorería: solo las suyas, hasta 5, sin promocionada', () => {
		const treasury = [1, 2, 3, 4, 5, 6].map(n => offer(`t${n}`))
		const result = composeShowcase({ treasury, promoted: offer('p1'), market: [offer('m1')], vip: false })
		expect(result.source).toBe('treasury')
		expect(result.offers.map(o => o.uuid)).toEqual(['t1', 't2', 't3', 't4', 't5'])
		expect(result.promotedUuid).toBeNull()
	})

	test('sin tesorería: la promocionada primera y el mercado sin repetirla', () => {
		const market = [offer('m1'), offer('p1'), offer('m2')]
		const result = composeShowcase({ treasury: [], promoted: offer('p1'), market, vip: false })
		expect(result.source).toBe('market')
		expect(result.offers.map(o => o.uuid)).toEqual(['p1', 'm1', 'm2'])
		expect(result.promotedUuid).toBe('p1')
	})

	test('un no-VIP no ve ofertas only_vip (ni de tesorería ni promocionada); un VIP sí', () => {
		const treasury = [offer('t1', { only_vip: 1 })]
		const market = [offer('m1', { only_vip: 1 }), offer('m2')]
		const asUser = composeShowcase({ treasury, promoted: offer('p1', { only_vip: 1 }), market, vip: false })
		expect(asUser).toEqual({ source: 'market', offers: [offer('m2')], promotedUuid: null })
		const asVip = composeShowcase({ treasury, promoted: offer('p1', { only_vip: 1 }), market, vip: true })
		expect(asVip.source).toBe('treasury')
		expect(asVip.offers.map(o => o.uuid)).toEqual(['t1'])
	})

	test('sin nada en ninguna fuente: mercado vacío', () => {
		expect(composeShowcase({ treasury: null, promoted: null, market: undefined, vip: false })).toEqual({ source: 'market', offers: [], promotedUuid: null })
	})
})

describe('requisitos', () => {
	test('showcaseRequirements: el máximo por clave entre las ofertas, null si ninguna trae', () => {
		const offers = [
			offer('a', { requirements: { min_completed: 10, min_rating: 4, min_account_days: 30 } }),
			offer('b', { requirements: { min_completed: 20, min_account_days: 0 } }),
			offer('c', { requirements: null }),
		]
		expect(showcaseRequirements(offers)).toEqual({ min_completed: 20, min_rating: 4, min_account_days: 30 })
		expect(showcaseRequirements([offer('c')])).toBeNull()
		expect(showcaseRequirements([])).toBeNull()
	})

	test('accountDaysSince: días fraccionarios, 0 sin fecha o con fecha ilegible', () => {
		const now = Date.UTC(2026, 10, 3)
		expect(accountDaysSince('2026-10-04T00:00:00Z', now)).toBe(30)
		expect(accountDaysSince('2026-11-02T12:00:00Z', now)).toBe(0.5)
		expect(accountDaysSince(null, now)).toBe(0)
		expect(accountDaysSince('nope', now)).toBe(0)
		expect(accountDaysSince('2030-01-01T00:00:00Z', now)).toBe(0)
	})

	test('applicantStatsFrom: perfil público + trustscore de la sesión, con la fecha de la sesión de respaldo', () => {
		const now = Date.UTC(2026, 10, 3)
		const profile = { user: { createdAt: '2026-10-04T00:00:00Z' }, stats: { completedP2P: '12', averageRating: 4.6 } }
		expect(applicantStatsFrom(profile, { trustscore: 70, created_at: '2020-01-01' }, now)).toEqual({ completed: 12, rating: 4.6, accountDays: 30, trustscore: 70 })
		expect(applicantStatsFrom({ stats: {} }, { created_at: '2026-10-04T00:00:00Z' }, now)).toEqual({ completed: 0, rating: 0, accountDays: 30, trustscore: 0 })
		expect(applicantStatsFrom(null, null, now)).toEqual({ completed: 0, rating: 0, accountDays: 0, trustscore: 0 })
	})

	test('evaluateRequirements: misma semántica que qpweb (floor en días, < required)', () => {
		const stats = { completed: 3, rating: 4.2, accountDays: 29.9, trustscore: 0 }
		const result = evaluateRequirements({ min_completed: 10, min_rating: 4, min_account_days: 30 }, stats)
		expect(result.ok).toBe(false)
		expect(result.missing).toEqual([
			{ key: 'min_completed', required: 10, actual: 3 },
			{ key: 'min_account_days', required: 30, actual: 29 },
		])
		expect(evaluateRequirements({ min_completed: 10, min_rating: 4, min_account_days: 30 }, { completed: 10, rating: 4, accountDays: 30, trustscore: 0 })).toEqual({ ok: true, missing: [] })
		expect(evaluateRequirements(null, stats)).toEqual({ ok: true, missing: [] })
		// Un requisito a 0 no cuenta
		expect(evaluateRequirements({ min_trustscore: 0 }, stats)).toEqual({ ok: true, missing: [] })
	})
})

describe('enlaces', () => {
	test('howToPayKey: una clave por moneda y un respaldo', () => {
		expect(howToPayKey('ETECSA')).toBe('add.viaP2P.howToPay.ETECSA')
		expect(howToPayKey('BANDECPREPAGO')).toBe('add.viaP2P.howToPay.BANDECPREPAGO')
		expect(howToPayKey('USDT')).toBe('add.viaP2P.howToPay.default')
	})

	test('marketParams: Comprar + mejor tasa, y @skymind solo con tesorería', () => {
		expect(marketParams('ETECSA', 'Saldo ETECSA', 'treasury')).toEqual({ coin: 'ETECSA', coinName: 'Saldo ETECSA', type: 'sell', sort: 'best_rate', peer: 'skymind' })
		expect(marketParams('BANK_CUP', undefined, 'market')).toEqual({ coin: 'BANK_CUP', coinName: 'BANK_CUP', type: 'sell', sort: 'best_rate' })
	})
})
