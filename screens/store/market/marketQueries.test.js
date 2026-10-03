/**
 * Tests de la paginación de pedidos del marketplace (lógica pura).
 * @jest-environment node
 */
// marketApi arrastra api/client (axios + módulos nativos); aquí solo se
// ejercita la lógica pura de paginación
jest.mock('../../../api/marketApi', () => ({ marketApi: {} }))

import { getNextOrdersPage, flattenOrders, ORDERS_PAGE_SIZE, getNextStoresPage, flattenStores, STORES_PAGE_SIZE } from './marketQueries'

const page = (uuids, total) => ({ orders: uuids.map(uuid => ({ uuid })), total })

describe('getNextOrdersPage', () => {
	test('avanza mientras lo acumulado no alcance el total', () => {
		const p1 = page(Array.from({ length: ORDERS_PAGE_SIZE }, (_, i) => `o${i}`), 25)
		expect(getNextOrdersPage(p1, [p1], 1)).toBe(2)

		const p2 = page(['o20', 'o21', 'o22', 'o23', 'o24'], 25)
		expect(getNextOrdersPage(p2, [p1, p2], 2)).toBeUndefined()
	})

	test('sin total no hay scroll (mismo guard que la versión manual)', () => {
		expect(getNextOrdersPage(page(['a'], null), [page(['a'], null)], 1)).toBeUndefined()
		expect(getNextOrdersPage(undefined, [], 1)).toBeUndefined()
	})
})

describe('flattenOrders', () => {
	test('aplana y deduplica por uuid entre páginas (offsets corridos)', () => {
		const flat = flattenOrders([
			page(['a', 'b'], 4),
			page(['b', 'c'], 4),
		])
		expect(flat.map(o => o.uuid)).toEqual(['a', 'b', 'c'])
	})

	test('tolera páginas vacías o datos ausentes', () => {
		expect(flattenOrders(undefined)).toEqual([])
		expect(flattenOrders([{ orders: null, total: 0 }])).toEqual([])
	})
})

const storesPage = (slugs, total) => ({ stores: slugs.map(slug => ({ slug })), total })

describe('getNextStoresPage', () => {
	test('avanza mientras lo acumulado no alcance el total', () => {
		const p1 = storesPage(Array.from({ length: STORES_PAGE_SIZE }, (_, i) => `s${i}`), 30)
		expect(getNextStoresPage(p1, [p1], 1)).toBe(2)

		const p2 = storesPage(['s24', 's25', 's26', 's27', 's28', 's29'], 30)
		expect(getNextStoresPage(p2, [p1, p2], 2)).toBeUndefined()
	})

	test('sin total o con página vacía corta (no pide en bucle)', () => {
		expect(getNextStoresPage(storesPage(['a'], null), [storesPage(['a'], null)], 1)).toBeUndefined()
		expect(getNextStoresPage(storesPage([], 99), [storesPage(['a'], 99), storesPage([], 99)], 2)).toBeUndefined()
		expect(getNextStoresPage(undefined, [], 1)).toBeUndefined()
	})
})

describe('flattenStores', () => {
	test('aplana y deduplica por slug entre páginas', () => {
		const flat = flattenStores([storesPage(['a', 'b'], 3), storesPage(['b', 'c'], 3)])
		expect(flat.map(s => s.slug)).toEqual(['a', 'b', 'c'])
	})

	test('tolera páginas vacías o datos ausentes', () => {
		expect(flattenStores(undefined)).toEqual([])
		expect(flattenStores([{ stores: null, total: 0 }])).toEqual([])
	})
})
