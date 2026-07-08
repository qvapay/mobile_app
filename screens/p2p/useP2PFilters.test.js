/**
 * Unit tests for the P2P marketplace filter state — node environment with
 * react-test-renderer (see keypadAmount.test.js for why).
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

describe('initial state', () => {
	test('defaults: recent sort, page size 30, no filters active', () => {
		const f = renderFilters()
		expect(f.current.hasActiveFilters).toBeFalsy()
		expect(f.current.orderBy).toBe('updated_at')
		expect(f.current.orderType).toBe('desc')
		expect(f.current.apiFilters).toEqual({
			take: 30,
			order: 'desc',
			orderBy: 'updated_at',
			type: null,
		})
		expect(f.current.activeFilterBadges).toEqual([])
	})

	test('a preselected coin from navigation params counts as an active filter', () => {
		const f = renderFilters({ tick: 'BANK_MLC' })
		expect(f.current.hasActiveFilters).toBe(true)
		expect(f.current.apiFilters.coin).toBe('BANK_MLC')
	})
})

describe('setFilter / apiFilters', () => {
	test('numeric strings are parsed into min/max/ratio params', () => {
		const f = renderFilters()
		act(() => {
			f.current.setFilter('minAmount', '10')
			f.current.setFilter('maxAmount', '500.5')
			f.current.setFilter('ratioMin', '0.9')
			f.current.setFilter('ratioMax', '1.1')
		})
		expect(f.current.apiFilters).toMatchObject({ min: 10, max: 500.5, ratio_min: 0.9, ratio_max: 1.1 })
	})

	test('non-numeric strings never reach the API params', () => {
		const f = renderFilters()
		act(() => { f.current.setFilter('minAmount', 'abc') })
		expect(f.current.apiFilters.min).toBeUndefined()
		expect(f.current.hasActiveFilters).toBe(true) // but the field IS set
	})

	test('showMine and onlyVip map to my=true and only_vip=1', () => {
		const f = renderFilters()
		act(() => {
			f.current.setFilter('showMine', true)
			f.current.setFilter('onlyVip', true)
		})
		expect(f.current.apiFilters.my).toBe(true)
		expect(f.current.apiFilters.only_vip).toBe(1)
	})

	test('sortIndex drives orderBy/orderType through SORT_OPTIONS', () => {
		const f = renderFilters()
		act(() => { f.current.setFilter('sortIndex', 2) })
		expect(f.current.orderBy).toBe(SORT_OPTIONS[2].orderBy)
		expect(f.current.orderType).toBe('asc')
		expect(f.current.apiFilters.order).toBe('asc')
	})

	test('typeFilter flows straight into apiFilters.type', () => {
		const f = renderFilters()
		act(() => { f.current.setFilter('typeFilter', 'buy') })
		expect(f.current.apiFilters.type).toBe('buy')
		expect(f.current.hasActiveFilters).toBe('buy') // truthy flag, current contract
	})
})

describe('activeFilterBadges', () => {
	test('each modal filter yields a removable badge with a Spanish label', () => {
		const f = renderFilters()
		act(() => {
			f.current.setFilter('showMine', true)
			f.current.setFilter('minAmount', '10')
			f.current.setFilter('onlyVip', true)
		})
		const labels = f.current.activeFilterBadges.map(b => b.label)
		expect(labels).toEqual(['Mis ofertas', 'Min: $10', 'Solo VIP'])

		// removing through the badge clears exactly that field
		act(() => { f.current.activeFilterBadges.find(b => b.key === 'minAmount').onRemove() })
		expect(f.current.apiFilters.min).toBeUndefined()
		expect(f.current.activeFilterBadges.map(b => b.key)).toEqual(['showMine', 'onlyVip'])
	})
})

describe('resetFilters', () => {
	test('returns everything to defaults, including a preselected coin', () => {
		const f = renderFilters({ tick: 'BTC' })
		act(() => {
			f.current.setFilter('minAmount', '5')
			f.current.setFilter('sortIndex', 3)
			f.current.setFilter('typeFilter', 'sell')
		})
		act(() => { f.current.resetFilters() })
		expect(f.current.hasActiveFilters).toBeFalsy()
		expect(f.current.orderBy).toBe('updated_at')
		expect(f.current.apiFilters).toEqual({ take: 30, order: 'desc', orderBy: 'updated_at', type: null })
	})
})
