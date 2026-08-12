/**
 * @jest-environment node
 */
import { MAX_ITEMS, MAX_QTY, cartItemKey, addItem, removeItem, setItemQty, cartCount, parseStoredItems } from './cartCore'

const item = (overrides = {}) => ({
	product_uuid: 'p1',
	qty: 1,
	title: 'Producto',
	image: null,
	price: 10,
	kind: 'physical',
	shop_slug: 'tienda',
	shop_name: 'Tienda',
	...overrides,
})

describe('cartCore', () => {

	describe('cartItemKey', () => {
		it('separates a product from its variants', () => {
			expect(cartItemKey(item())).toBe('p1:')
			expect(cartItemKey(item({ variant_uuid: 'v1' }))).toBe('p1:v1')
			expect(cartItemKey(item())).not.toBe(cartItemKey(item({ variant_uuid: 'v1' })))
		})
	})

	describe('addItem', () => {
		it('adds a new line with clamped qty and added_at', () => {
			const { items, added } = addItem([], item({ qty: 0 }), 123)
			expect(added).toBe(true)
			expect(items).toHaveLength(1)
			expect(items[0].qty).toBe(1)
			expect(items[0].added_at).toBe(123)
		})

		it('merges duplicates by product+variant summing qty', () => {
			const first = addItem([], item({ variant_uuid: 'v1', qty: 2 })).items
			const { items, added } = addItem(first, item({ variant_uuid: 'v1', qty: 3 }))
			expect(added).toBe(true)
			expect(items).toHaveLength(1)
			expect(items[0].qty).toBe(5)
		})

		it('keeps product-only and variant lines separate', () => {
			const first = addItem([], item()).items
			const { items } = addItem(first, item({ variant_uuid: 'v1' }))
			expect(items).toHaveLength(2)
		})

		it('caps merged qty at MAX_QTY', () => {
			const first = addItem([], item({ qty: 998 })).items
			const { items } = addItem(first, item({ qty: 5 }))
			expect(items[0].qty).toBe(MAX_QTY)
		})

		it('rejects a new line when the cart is full', () => {
			let items = []
			for (let i = 0; i < MAX_ITEMS; i++) items = addItem(items, item({ product_uuid: `p${i}` })).items
			const result = addItem(items, item({ product_uuid: 'p-extra' }))
			expect(result.added).toBe(false)
			expect(result.items).toHaveLength(MAX_ITEMS)
		})

		it('still merges into an existing line when the cart is full', () => {
			let items = []
			for (let i = 0; i < MAX_ITEMS; i++) items = addItem(items, item({ product_uuid: `p${i}` })).items
			const result = addItem(items, item({ product_uuid: 'p0', qty: 2 }))
			expect(result.added).toBe(true)
			expect(result.items.find((i) => i.product_uuid === 'p0').qty).toBe(3)
		})
	})

	describe('removeItem / setItemQty', () => {
		it('removes only the matching line', () => {
			const items = [item(), item({ variant_uuid: 'v1' })]
			const next = removeItem(items, 'p1:v1')
			expect(next).toHaveLength(1)
			expect(next[0].variant_uuid).toBeUndefined()
		})

		it('clamps quantities to 1..MAX_QTY', () => {
			const items = [item()]
			expect(setItemQty(items, 'p1:', 0)[0].qty).toBe(1)
			expect(setItemQty(items, 'p1:', -5)[0].qty).toBe(1)
			expect(setItemQty(items, 'p1:', 1500)[0].qty).toBe(MAX_QTY)
			expect(setItemQty(items, 'p1:', 7)[0].qty).toBe(7)
			expect(setItemQty(items, 'p1:', 'abc')[0].qty).toBe(1)
		})
	})

	describe('cartCount', () => {
		it('sums quantities across lines', () => {
			expect(cartCount([])).toBe(0)
			expect(cartCount([item({ qty: 2 }), item({ variant_uuid: 'v1', qty: 3 })])).toBe(5)
			expect(cartCount([item({ qty: undefined })])).toBe(1)
		})
	})

	describe('parseStoredItems', () => {
		it('parses valid payloads and drops junk', () => {
			expect(parseStoredItems(JSON.stringify([item(), { no_uuid: true }, null]))).toHaveLength(1)
		})

		it('never throws on corrupt payloads', () => {
			expect(parseStoredItems('not-json')).toEqual([])
			expect(parseStoredItems(JSON.stringify({ a: 1 }))).toEqual([])
			expect(parseStoredItems(null)).toEqual([])
		})
	})
})
