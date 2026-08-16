/**
 * Unit tests for the P2P marketplace filter state — node environment with
 * react-test-renderer (see keypadAmount.test.js for why).
 *
 * Cubre el reparto servidor/cliente: el backend ignora ratio y VIP (nunca
 * llegan al WHERE) y su `orderBy=ratio` rompe la paginación, así que esos tres
 * se resuelven aquí; el resto viaja como query params.
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import useP2PFilters, { SORT_OPTIONS, applyClientFilters, offerRate } from './useP2PFilters'

const renderFilters = (initialCoin = null) => {
	const result = { current: null }
	const Harness = () => {
		result.current = useP2PFilters(initialCoin)
		return null
	}
	act(() => { create(<Harness />) })
	return result
}

const set = (f, field, value) => act(() => { f.current.setFilter(field, value) })

describe('initial state', () => {
	test('defaults: recent sort, page size 30, no filters active', () => {
		const f = renderFilters()
		expect(f.current.hasActiveFilters).toBeFalsy()
		expect(f.current.orderBy).toBe('updated_at')
		expect(f.current.orderType).toBe('desc')
		expect(f.current.isClientSorted).toBe(false)
		expect(f.current.apiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: null })
	})
})

describe('apiFilters — solo lo que el backend entiende', () => {
	test('"quiero operar $X" viaja como min', () => {
		const f = renderFilters()
		set(f, 'opAmount', '500')
		expect(f.current.apiFilters.min).toBe(500)
	})

	test('un monto no numérico nunca llega a la API', () => {
		const f = renderFilters()
		set(f, 'opAmount', 'abc')
		expect(f.current.apiFilters.min).toBeUndefined()
	})

	test('showMine, coin y type viajan al servidor', () => {
		const f = renderFilters()
		set(f, 'showMine', true)
		set(f, 'selectedCoin', { tick: 'BANK_CUP' })
		set(f, 'typeFilter', 'buy')
		expect(f.current.apiFilters).toMatchObject({ my: true, coin: 'BANK_CUP', type: 'buy' })
	})

	test('ratio y VIP NO viajan a la API: el backend los ignoraba', () => {
		const f = renderFilters()
		set(f, 'ratioMin', '10')
		set(f, 'ratioMax', '99')
		set(f, 'onlyVip', true)
		const keys = Object.keys(f.current.apiFilters)
		expect(keys).not.toContain('ratio_min')
		expect(keys).not.toContain('ratio_max')
		expect(keys).not.toContain('only_vip')
		expect(f.current.clientFilters).toMatchObject({ ratioMin: 10, ratioMax: 99, onlyVip: true })
	})
})

describe('orden', () => {
	test('los órdenes de servidor paginan de 30 en 30', () => {
		const f = renderFilters()
		const amountDesc = SORT_OPTIONS.findIndex(o => o.label === 'Monto ↓')
		set(f, 'sortIndex', amountDesc)
		expect(f.current.apiFilters).toMatchObject({ orderBy: 'amount', order: 'desc', take: 30 })
		expect(f.current.isClientSorted).toBe(false)
	})

	test('los órdenes de cliente piden una tanda grande y no mandan su orderBy', () => {
		const f = renderFilters()
		const byRate = SORT_OPTIONS.findIndex(o => o.key === 'rate')
		set(f, 'sortIndex', byRate)
		expect(f.current.isClientSorted).toBe(true)
		expect(f.current.apiFilters.take).toBe(100)
		// El orderBy=ratio del backend rompe la paginación: no se usa
		expect(f.current.apiFilters.orderBy).toBe('updated_at')
		expect(f.current.clientFilters.sort).toBe('rate')
	})
})

describe('hasActiveFilters', () => {
	test('el lado del mercado NO cuenta como filtro (vive en el switch del TopBar)', () => {
		const f = renderFilters()
		set(f, 'typeFilter', 'sell')
		expect(f.current.hasActiveFilters).toBeFalsy()
	})

	test('cualquier filtro del modal sí lo enciende', () => {
		const f = renderFilters()
		set(f, 'onlyVip', true)
		expect(f.current.hasActiveFilters).toBe(true)
	})
})

describe('resetFilters', () => {
	test('limpia todo pero respeta el lado del mercado elegido', () => {
		const f = renderFilters({ tick: 'BANK_CUP' })
		set(f, 'typeFilter', 'buy')
		set(f, 'onlyVip', true)
		set(f, 'opAmount', '100')
		act(() => { f.current.resetFilters() })
		expect(f.current.filters.onlyVip).toBe(false)
		expect(f.current.filters.opAmount).toBe('')
		expect(f.current.filters.selectedCoin).toBe(null)
		expect(f.current.filters.typeFilter).toBe('buy')
	})
})

describe('activeFilterBadges', () => {
	test('cada filtro del modal da un badge en español que se puede quitar', () => {
		const f = renderFilters()
		set(f, 'opAmount', '250')
		set(f, 'ratioMin', '10')
		set(f, 'onlyVip', true)
		expect(f.current.activeFilterBadges.map(b => b.label)).toEqual(['Opero $250', 'Tasa ≥ 10', 'Solo VIP'])
		act(() => { f.current.activeFilterBadges[0].onRemove() })
		expect(f.current.filters.opAmount).toBe('')
	})
})

describe('applyClientFilters', () => {
	const offer = (over = {}) => ({ amount: '10', receive: '9.5', only_vip: false, User: { rating_avg: 0, _count: { P2P: 0, P2P_Peer: 0 } }, ...over })

	test('offerRate calcula receive/amount y protege el cero', () => {
		expect(offerRate(offer())).toBeCloseTo(0.95)
		expect(offerRate(offer({ amount: '0' }))).toBe(null)
	})

	test('filtra por VIP', () => {
		const list = [offer({ uuid: 'a', only_vip: true }), offer({ uuid: 'b' })]
		expect(applyClientFilters(list, { onlyVip: true }).map(o => o.uuid)).toEqual(['a'])
	})

	test('filtra por rango de tasa', () => {
		const list = [offer({ uuid: 'baja', receive: '5' }), offer({ uuid: 'alta', receive: '20' })]
		expect(applyClientFilters(list, { ratioMin: 1 }).map(o => o.uuid)).toEqual(['alta'])
		expect(applyClientFilters(list, { ratioMax: 1 }).map(o => o.uuid)).toEqual(['baja'])
	})

	test('ordena por mejor tasa de mayor a menor', () => {
		const list = [offer({ uuid: 'media', receive: '9.5' }), offer({ uuid: 'mejor', receive: '12' }), offer({ uuid: 'peor', receive: '8' })]
		expect(applyClientFilters(list, { sort: 'rate' }).map(o => o.uuid)).toEqual(['mejor', 'media', 'peor'])
	})

	test('en reputación, a igual rating manda la experiencia', () => {
		const novato = offer({ uuid: 'novato', User: { rating_avg: 5, _count: { P2P: 2, P2P_Peer: 0 } } })
		const veterano = offer({ uuid: 'veterano', User: { rating_avg: 5, _count: { P2P: 300, P2P_Peer: 20 } } })
		const flojo = offer({ uuid: 'flojo', User: { rating_avg: 3.2, _count: { P2P: 500, P2P_Peer: 0 } } })
		expect(applyClientFilters([novato, flojo, veterano], { sort: 'reputation' }).map(o => o.uuid))
			.toEqual(['veterano', 'novato', 'flojo'])
	})

	test('usa la reputación del Peer cuando la oferta ya tiene contraparte', () => {
		const list = [
			offer({ uuid: 'conPeer', User: { rating_avg: 1, _count: {} }, Peer: { uuid: 'p', rating_avg: 5, _count: { P2P: 10 } } }),
			offer({ uuid: 'sinPeer', User: { rating_avg: 3, _count: {} } }),
		]
		expect(applyClientFilters(list, { sort: 'reputation' }).map(o => o.uuid)).toEqual(['conPeer', 'sinPeer'])
	})

	test('no muta la lista original', () => {
		const list = [offer({ uuid: 'a', receive: '5' }), offer({ uuid: 'b', receive: '20' })]
		applyClientFilters(list, { sort: 'rate' })
		expect(list.map(o => o.uuid)).toEqual(['a', 'b'])
	})
})
