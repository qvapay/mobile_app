/**
 * Unit tests for the P2P marketplace filter state — node environment with
 * react-test-renderer (see keypadAmount.test.js for why).
 *
 * Todos los filtros y órdenes viajan al servidor. Hubo una etapa en la que
 * ratio/VIP y los órdenes por tasa y reputación se resolvían en el cliente
 * porque el backend los ignoraba; estos tests fijan que ya no es así.
 * @jest-environment node
 */
import React from 'react'
import { act, create } from 'react-test-renderer'
import useP2PFilters, { SORT_OPTIONS } from './useP2PFilters'

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
	test('defaults: Comprar, recent sort, page size 30, no filters active', () => {
		const f = renderFilters()
		expect(f.current.hasActiveFilters).toBeFalsy()
		expect(f.current.orderBy).toBe('updated_at')
		expect(f.current.orderType).toBe('desc')
		// El lado del mercado arranca elegido: nunca es null (el switch del
		// TopBar es un modo, y sin lado la lista mezclaba compras y ventas)
		expect(f.current.filters.typeFilter).toBe('sell')
		expect(f.current.apiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: 'sell' })
	})
})

describe('apiFilters', () => {
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

	test('ratio y VIP viajan al servidor (filtrarlos en cliente vaciaba páginas)', () => {
		const f = renderFilters()
		set(f, 'ratioMin', '10')
		set(f, 'ratioMax', '99')
		set(f, 'onlyVip', true)
		expect(f.current.apiFilters).toMatchObject({ ratio_min: 10, ratio_max: 99, only_vip: true })
	})

	test('un ratio no numérico nunca llega a la API', () => {
		const f = renderFilters()
		set(f, 'ratioMin', 'abc')
		expect(f.current.apiFilters.ratio_min).toBeUndefined()
	})
})

describe('orden', () => {
	test('todos los órdenes son de servidor y mantienen la paginación de 30', () => {
		// Con moneda elegida: `best_rate` la exige y sin ella se degradaría
		const f = renderFilters({ tick: 'BANK_CUP' })
		SORT_OPTIONS.forEach((option, index) => {
			set(f, 'sortIndex', index)
			expect(f.current.apiFilters).toMatchObject({
				orderBy: option.orderBy,
				order: option.orderType,
				take: 30,
			})
		})
	})

	test('usa los campos ordenables que el backend acepta', () => {
		// Lista blanca del servidor: updated_at, created_at, amount, receive,
		// ratio, rating, trades, best_rate
		const valid = ['updated_at', 'created_at', 'amount', 'receive', 'ratio', 'rating', 'trades', 'best_rate']
		SORT_OPTIONS.forEach(o => expect(valid).toContain(o.orderBy))
	})

	test('"mejor tasa" pide best_rate, no ratio (ratio desc devolvía las peores en Comprar)', () => {
		const bestRate = SORT_OPTIONS.find(o => o.labelKey === 'p2p.filters.sort.bestRate')
		expect(bestRate).toMatchObject({ orderBy: 'best_rate', orderType: 'desc', requiresCoin: true })
	})

	test('best_rate sin moneda se degrada al orden por defecto (el backend responde 400)', () => {
		const f = renderFilters()
		const index = SORT_OPTIONS.findIndex(o => o.requiresCoin)
		set(f, 'sortIndex', index)
		expect(f.current.apiFilters.orderBy).toBe('updated_at')
		// Y vuelve a aplicarse en cuanto hay moneda
		set(f, 'selectedCoin', { tick: 'BANK_CUP' })
		expect(f.current.apiFilters.orderBy).toBe('best_rate')
	})

	test('best_rate no viaja con "mis ofertas" (mide la conveniencia de quien toma)', () => {
		const f = renderFilters({ tick: 'BANK_CUP' })
		set(f, 'sortIndex', SORT_OPTIONS.findIndex(o => o.requiresCoin))
		set(f, 'showMine', true)
		expect(f.current.apiFilters.orderBy).toBe('updated_at')
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
	test('limpia todo pero respeta el lado del mercado elegido y «Mis ofertas» (modos del TopBar)', () => {
		const f = renderFilters({ tick: 'BANK_CUP' })
		set(f, 'typeFilter', 'buy')
		set(f, 'showMine', true)
		set(f, 'onlyVip', true)
		set(f, 'opAmount', '100')
		act(() => { f.current.resetFilters() })
		expect(f.current.filters.onlyVip).toBe(false)
		expect(f.current.filters.opAmount).toBe('')
		expect(f.current.filters.selectedCoin).toBe(null)
		expect(f.current.filters.typeFilter).toBe('buy')
		expect(f.current.filters.showMine).toBe(true)
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

describe('peer (solo las ofertas de un comerciante: «Ver todas» del depósito Vía P2P)', () => {
	test('viaja al servidor, cuenta como filtro activo y su badge lo quita', () => {
		const f = renderFilters()
		set(f, 'peer', 'skymind')
		expect(f.current.apiFilters.peer).toBe('skymind')
		expect(f.current.hasActiveFilters).toBe(true)
		const badge = f.current.activeFilterBadges.find(b => b.key === 'peer')
		expect(badge.label).toBe('Ofertas de @skymind')
		act(() => { badge.onRemove() })
		expect(f.current.filters.peer).toBeNull()
		expect(f.current.apiFilters.peer).toBeUndefined()
	})

	test('"Limpiar" también lo quita', () => {
		const f = renderFilters()
		set(f, 'peer', 'skymind')
		act(() => { f.current.resetFilters() })
		expect(f.current.filters.peer).toBeNull()
	})
})

describe('applyLink', () => {
	const link = (f, value) => act(() => { f.current.applyLink(value) })

	test('es «Limpiar» más lo que traiga el enlace', () => {
		const f = renderFilters({ tick: 'BANK_CUP' })
		set(f, 'opAmount', '50')
		set(f, 'ratioMin', '300')
		set(f, 'ratioMax', '400')
		set(f, 'onlyVip', true)
		set(f, 'peer', 'skymind')
		link(f, { coin: { tick: 'USDT' }, type: 'buy' })
		expect(f.current.apiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: 'buy', coin: 'USDT' })
	})

	test('el lado no se pierde si el enlace no lo pide: nunca es null', () => {
		const f = renderFilters()
		set(f, 'typeFilter', 'buy')
		link(f, { coin: { tick: 'USDT' } })
		expect(f.current.filters.typeFilter).toBe('buy')
	})

	test('sustituye el orden elegido, y "Mejor tasa" solo se aplica con moneda', () => {
		const f = renderFilters()
		set(f, 'sortIndex', 1)
		link(f, { coin: { tick: 'USDT' }, sort: 'best_rate' })
		expect(f.current.orderBy).toBe('best_rate')
		link(f, { peer: 'skymind', sort: 'best_rate' })
		expect(f.current.filters.sortIndex).toBe(0)
		expect(f.current.apiFilters).toMatchObject({ orderBy: 'updated_at', peer: 'skymind' })
	})

	test('en «Mis ofertas» no cambia nada', () => {
		const f = renderFilters({ tick: 'BANK_CUP' })
		set(f, 'showMine', true)
		set(f, 'onlyVip', true)
		const before = f.current.filters
		link(f, { coin: { tick: 'USDT' }, type: 'buy', peer: 'skymind', sort: 'best_rate' })
		expect(f.current.filters).toBe(before)
	})

	test('«Limpiar» sigue dejando el lado y «Mis ofertas»', () => {
		const f = renderFilters()
		set(f, 'typeFilter', 'buy')
		set(f, 'showMine', true)
		set(f, 'onlyVip', true)
		act(() => { f.current.resetFilters() })
		expect(f.current.filters).toMatchObject({ typeFilter: 'buy', showMine: true, onlyVip: false })
	})
})
