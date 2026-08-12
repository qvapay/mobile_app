/**
 * @jest-environment node
 */
import {
	MARKET_CATEGORIES,
	MARKET_CATEGORY_EMOJIS,
	MARKET_ORDER_STATUS,
	KIND_LABELS,
	socialHref,
	formatPriceRange,
	countryName,
	shipToSummary,
} from './marketConstants'

describe('marketConstants', () => {

	it('mirrors the 11 backend SHOP_CATEGORIES with emojis for each', () => {
		const expected = ['electronics', 'fashion', 'home', 'beauty', 'food', 'sports', 'gaming', 'books', 'digital', 'services', 'other']
		expect(Object.keys(MARKET_CATEGORIES)).toEqual(expected)
		expect(Object.keys(MARKET_CATEGORY_EMOJIS).sort()).toEqual([...expected].sort())
	})

	it('covers the 4 order statuses with label and theme color', () => {
		expect(Object.keys(MARKET_ORDER_STATUS).sort()).toEqual(['cancelled', 'fulfilled', 'paid', 'refunded'])
		Object.values(MARKET_ORDER_STATUS).forEach((s) => {
			expect(s.label).toBeTruthy()
			expect(s.color).toBeTruthy()
		})
		expect(Object.keys(KIND_LABELS).sort()).toEqual(['digital', 'giftcard', 'physical', 'service'])
	})

	describe('socialHref', () => {
		it('links handles per network', () => {
			expect(socialHref('telegram', '@mitienda')).toBe('https://t.me/mitienda')
			expect(socialHref('instagram', 'mitienda')).toBe('https://instagram.com/mitienda')
			expect(socialHref('x', '@mitienda')).toBe('https://x.com/mitienda')
			expect(socialHref('facebook', 'mitienda')).toBe('https://facebook.com/mitienda')
		})
		it('passes full URLs and bare domains through', () => {
			expect(socialHref('web', 'https://mitienda.com')).toBe('https://mitienda.com')
			expect(socialHref('web', 'mitienda.com')).toBe('https://mitienda.com')
			expect(socialHref('facebook', 'facebook.com/mitienda')).toBe('https://facebook.com/mitienda')
		})
		it('builds wa.me from phone digits and rejects short ones', () => {
			expect(socialHref('whatsapp', '+53 5555 5555')).toBe('https://wa.me/5355555555')
			expect(socialHref('whatsapp', '123')).toBeNull()
		})
		it('returns null for empty or unlinkable values', () => {
			expect(socialHref('telegram', '')).toBeNull()
			expect(socialHref('web', 'solo texto')).toBeNull()
		})
	})

	describe('formatPriceRange', () => {
		it('formats single prices and ranges', () => {
			expect(formatPriceRange(10)).toBe('$10.00')
			expect(formatPriceRange(10, 10)).toBe('$10.00')
			expect(formatPriceRange(10, 15.5)).toBe('$10.00 – $15.50')
			expect(formatPriceRange(null)).toBe('')
		})
	})

	describe('countryName / shipToSummary', () => {
		it('localizes ISO-2 codes with graceful fallback', () => {
			expect(countryName('CU')).toBeTruthy()
			expect(countryName('cu')).toBe(countryName('CU'))
			expect(countryName('ZZZ')).toBe('ZZZ')
		})
		it('summarizes destinations', () => {
			expect(shipToSummary(null)).toBeNull()
			expect(shipToSummary({ US: null })).toBe(countryName('US'))
			expect(shipToSummary({ CU: ['LHA', 'MTZ'] })).toBe(`${countryName('CU')} (LHA, MTZ)`)
		})
	})
})
