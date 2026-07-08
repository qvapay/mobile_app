/**
 * @jest-environment node
 */
import { money, feePercent, providerLabel, US_STATES, STORES, ORDER_STATUS, MINIMUM_CART } from './assistedConstants'

describe('assistedConstants', () => {

	describe('money', () => {
		it('formats USD with two decimals', () => {
			expect(money(20)).toBe('$20.00')
			expect(money(19.999)).toBe('$20.00')
			expect(money('15.5')).toBe('$15.50')
		})

		it('falls back to $0.00 for empty values', () => {
			expect(money(null)).toBe('$0.00')
			expect(money(undefined)).toBe('$0.00')
		})
	})

	describe('feePercent', () => {
		it('derives the fee from price vs qp_price', () => {
			expect(feePercent(100, 101)).toBe(1)
			expect(feePercent(50, 50.5)).toBe(1)
		})

		it('returns 0 when there is no markup', () => {
			expect(feePercent(100, 100)).toBe(0)
			expect(feePercent(100, 99)).toBe(0)
		})

		it('returns 0 on missing or invalid prices', () => {
			expect(feePercent(0, 10)).toBe(0)
			expect(feePercent(null, 10)).toBe(0)
			expect(feePercent(10, null)).toBe(0)
		})
	})

	describe('providerLabel', () => {
		it('maps known providers to display labels', () => {
			expect(providerLabel('amazon')).toBe('Amazon')
			expect(providerLabel('ebay')).toBe('eBay')
			expect(providerLabel('bestbuy')).toBe('Best Buy')
		})

		it('passes through unknown providers', () => {
			expect(providerLabel('custom')).toBe('custom')
			expect(providerLabel(null)).toBe('')
		})
	})

	it('lists 50 states + DC with 2-letter codes', () => {
		expect(US_STATES).toHaveLength(51)
		US_STATES.forEach(s => expect(s.code).toMatch(/^[A-Z]{2}$/))
		expect(new Set(US_STATES.map(s => s.code)).size).toBe(51)
	})

	it('marks only Amazon and eBay as available stores', () => {
		expect(STORES.filter(s => s.available).map(s => s.key)).toEqual(['amazon', 'ebay'])
	})

	it('covers every backend order status', () => {
		expect(Object.keys(ORDER_STATUS).sort()).toEqual(['cancelled', 'delivered', 'paid', 'pending', 'purchased'])
	})

	it('matches the backend cart minimum', () => {
		expect(MINIMUM_CART).toBe(20)
	})
})
