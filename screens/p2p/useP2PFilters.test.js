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
	test('defaults: recent sort, page size 30, no filters active', () => {
		const f = renderFilters()
		expect(f.current.hasActiveFilters).toBeFalsy()
		expect(f.current.orderBy).toBe('updated_at')
		expect(f.current.orderType).toBe('desc')
		expect(f.current.apiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: null })
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
		const f = renderFilters()
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
		// ratio, rating, trades
		const valid = ['updated_at', 'created_at', 'amount', 'receive', 'ratio', 'rating', 'trades']
		SORT_OPTIONS.forEach(o => expect(valid).toContain(o.orderBy))
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
