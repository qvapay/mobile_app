/**
 * @jest-environment node
 */
import {
	PROBLEM_LABELS,
	effectivePrice,
	addressEligible,
	enrichCartItems,
	groupByShop,
	mapOrderError,
	isAbortingOrderError,
	makeIdemKey,
} from './marketCheckout'

const cartItem = (overrides = {}) => ({
	product_uuid: 'p1',
	qty: 1,
	title: 'Producto',
	price: 10,
	kind: 'physical',
	shop_slug: 'tienda',
	shop_name: 'Tienda',
	...overrides,
})

const freshProduct = (overrides = {}) => ({
	uuid: 'p1',
	title: 'Producto',
	kind: 'physical',
	price: 12,
	active: true,
	track_inventory: true,
	stock: 5,
	option_axes: null,
	variants: [],
	ship_to: null,
	shop: { slug: 'tienda', name: 'Tienda', active: true },
	...overrides,
})

describe('marketCheckout', () => {

	describe('effectivePrice', () => {
		it('prefers the variant price and falls back to the product', () => {
			expect(effectivePrice({ price: 10 }, { price: 15 })).toBe(15)
			expect(effectivePrice({ price: 10 }, { price: null })).toBe(10)
			expect(effectivePrice({ price: 10 }, null)).toBe(10)
			expect(effectivePrice(null, null)).toBe(0)
		})
	})

	describe('addressEligible', () => {
		const us = { country: 'US', state: 'FL' }
		it('allows everything when ship_to is null', () => {
			expect(addressEligible(us, null)).toBe(true)
			expect(addressEligible(null, null)).toBe(true)
		})
		it('matches whole countries and province lists case-insensitively', () => {
			expect(addressEligible(us, { US: null })).toBe(true)
			expect(addressEligible(us, { CU: null })).toBe(false)
			expect(addressEligible(us, { US: ['fl', 'NY'] })).toBe(true)
			expect(addressEligible(us, { US: ['NY'] })).toBe(false)
			expect(addressEligible({ country: 'us', state: 'fl' }, { US: ['FL'] })).toBe(true)
		})
	})

	describe('enrichCartItems', () => {
		it('flags nothing while revalidating (freshMap null)', () => {
			const [e] = enrichCartItems([cartItem()], null, null)
			expect(e.problem).toBeNull()
			expect(e.unitPrice).toBe(10) // snapshot price
			expect(e.maxQty).toBe(999)
		})

		it('marks gone when the product, its active flag or its shop dropped', () => {
			expect(enrichCartItems([cartItem()], {}, null)[0].problem).toBe('gone')
			expect(enrichCartItems([cartItem()], { p1: freshProduct({ active: false }) }, null)[0].problem).toBe('gone')
			expect(enrichCartItems([cartItem()], { p1: freshProduct({ shop: { active: false } }) }, null)[0].problem).toBe('gone')
		})

		it('marks gone when the chosen variant disappeared', () => {
			const fresh = { p1: freshProduct({ variants: [{ uuid: 'v2', price: 9, stock: 1 }] }) }
			expect(enrichCartItems([cartItem({ variant_uuid: 'v1' })], fresh, null)[0].problem).toBe('gone')
		})

		it('marks variant_required when the product gained variants', () => {
			const fresh = { p1: freshProduct({ option_axes: ['Color'], variants: [{ uuid: 'v1', price: 9, stock: 1 }] }) }
			expect(enrichCartItems([cartItem()], fresh, null)[0].problem).toBe('variant_required')
		})

		it('uses fresh prices (variant and product)', () => {
			const fresh = { p1: freshProduct({ variants: [{ uuid: 'v1', price: 20, stock: 3 }] }) }
			expect(enrichCartItems([cartItem({ variant_uuid: 'v1' })], fresh, null)[0].unitPrice).toBe(20)
			expect(enrichCartItems([cartItem()], { p1: freshProduct() }, null)[0].unitPrice).toBe(12)
		})

		it('handles stock: soldout, clamped qty, unlimited null and untracked', () => {
			expect(enrichCartItems([cartItem()], { p1: freshProduct({ stock: 0 }) }, null)[0].problem).toBe('soldout')
			const clamped = enrichCartItems([cartItem({ qty: 10 })], { p1: freshProduct({ stock: 4 }) }, null)[0]
			expect(clamped.qty).toBe(4)
			expect(clamped.maxQty).toBe(4)
			const untracked = enrichCartItems([cartItem()], { p1: freshProduct({ track_inventory: false, stock: 0 }) }, null)[0]
			expect(untracked.problem).toBeNull()
			expect(untracked.maxQty).toBe(999)
			const unlimitedVariant = enrichCartItems(
				[cartItem({ variant_uuid: 'v1' })],
				{ p1: freshProduct({ variants: [{ uuid: 'v1', price: 9, stock: null }] }) },
				null
			)[0]
			expect(unlimitedVariant.maxQty).toBe(999)
		})

		it('blocks shipping for physical items outside ship_to', () => {
			const addr = { country: 'US', state: 'FL' }
			const blocked = enrichCartItems([cartItem()], { p1: freshProduct({ ship_to: { CU: null } }) }, addr)[0]
			expect(blocked.shipBlocked).toBe(true)
			const allowed = enrichCartItems([cartItem()], { p1: freshProduct({ ship_to: { US: null } }) }, addr)[0]
			expect(allowed.shipBlocked).toBe(false)
			// Sin dirección elegida aún no se puede evaluar.
			const noAddr = enrichCartItems([cartItem()], { p1: freshProduct({ ship_to: { CU: null } }) }, null)[0]
			expect(noAddr.shipBlocked).toBe(false)
			// Digital nunca bloquea por envío.
			const digital = enrichCartItems([cartItem({ kind: 'digital' })], { p1: freshProduct({ kind: 'digital', ship_to: { CU: null } }) }, addr)[0]
			expect(digital.shipBlocked).toBe(false)
		})

		it('carries per-line checkout statuses', () => {
			const [e] = enrichCartItems([cartItem()], null, null, { 'p1:': 'paying' })
			expect(e.status).toBe('paying')
		})
	})

	describe('groupByShop', () => {
		it('groups by fresh shop name with snapshot fallback, in first-seen order', () => {
			const entries = enrichCartItems(
				[cartItem(), cartItem({ product_uuid: 'p2', shop_name: 'Otra', shop_slug: 'otra' }), cartItem({ product_uuid: 'p3' })],
				null,
				null
			)
			const groups = groupByShop(entries)
			expect(groups.map((g) => g.name)).toEqual(['Tienda', 'Otra'])
			expect(groups[0].entries).toHaveLength(2)
			expect(groups[1].slug).toBe('otra')
		})
	})

	describe('mapOrderError / isAbortingOrderError', () => {
		it('maps backend codes to Spanish messages', () => {
			expect(mapOrderError(409, 'OUT_OF_STOCK')).toBe('Se agotó mientras comprabas')
			expect(mapOrderError(409, 'PRODUCT_GONE')).toBe('Ya no está disponible')
			expect(mapOrderError(400, 'VARIANT_REQUIRED')).toBe('Elige de nuevo las opciones del producto')
			expect(mapOrderError(400, 'SHIP_TO_BLOCKED')).toBe('El vendedor no envía a tu dirección')
			expect(mapOrderError(400, 'Saldo insuficiente')).toBe('Saldo insuficiente')
			expect(mapOrderError(429, undefined)).toMatch(/ocupado/)
			expect(mapOrderError(500, undefined)).toBe('No pudimos procesar la compra')
		})

		it('aborts the loop only on insufficient balance', () => {
			expect(isAbortingOrderError('Saldo insuficiente')).toBe(true)
			expect(isAbortingOrderError('saldo insuficiente para esta compra')).toBe(true)
			expect(isAbortingOrderError('OUT_OF_STOCK')).toBe(false)
			expect(isAbortingOrderError(undefined)).toBe(false)
		})
	})

	describe('makeIdemKey', () => {
		it('matches the backend shape and is unique enough', () => {
			const key = makeIdemKey()
			expect(key).toMatch(/^[A-Za-z0-9._-]{8,64}$/)
			expect(makeIdemKey()).not.toBe(makeIdemKey())
		})
	})

	describe('PROBLEM_LABELS', () => {
		it('covers every problem code', () => {
			expect(Object.keys(PROBLEM_LABELS).sort()).toEqual(['gone', 'soldout', 'variant_required'])
		})
	})
})
