/**
 * Tests de la paginación de pedidos del marketplace (lógica pura).
 * @jest-environment node
 */
// marketApi arrastra api/client (axios + módulos nativos); aquí solo se
// ejercita la lógica pura de paginación
jest.mock('../../../api/marketApi', () => ({ marketApi: {} }))

import { getNextOrdersPage, flattenOrders, ORDERS_PAGE_SIZE } from './marketQueries'

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
