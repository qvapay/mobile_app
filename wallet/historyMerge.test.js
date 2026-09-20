/**
 * @jest-environment node
 */
import { applyNewerPages, applyOlderPage, emptyHistoryCache, HISTORY_CACHE_MAX_ITEMS, mergeHistory, overlapsCache, txKey } from './historyMerge'

const tx = (hash, time, over = {}) => ({ hash, time, direction: 'in', from: 'A', to: 'B', amount: '1', symbol: 'USDT', contract: null, fee: null, status: 'confirmed', ...over })

describe('mergeHistory', () => {
	test('dedupe por hash, lo nuevo pisa (pendiente → confirmada), orden desc y tope', () => {
		const existing = [tx('b', 20, { status: 'pending' }), tx('a', 10)]
		const merged = mergeHistory(existing, [tx('c', 30), tx('b', 20, { status: 'confirmed' })])
		expect(merged.map(t => t.hash)).toEqual(['c', 'b', 'a'])
		expect(merged[1].status).toBe('confirmed')
		const many = Array.from({ length: HISTORY_CACHE_MAX_ITEMS + 50 }, (_, i) => tx(`h${i}`, i))
		expect(mergeHistory([], many)).toHaveLength(HISTORY_CACHE_MAX_ITEMS)
		expect(mergeHistory([], many)[0].hash).toBe(`h${HISTORY_CACHE_MAX_ITEMS + 49}`)
	})

	test('dos transferencias de token en la misma tx no se funden', () => {
		const a = tx('same', 5, { to: 'X', amount: '1' })
		const b = tx('same', 5, { to: 'Y', amount: '2' })
		expect(txKey(a)).not.toBe(txKey(b))
		expect(mergeHistory([], [a, b])).toHaveLength(2)
	})
})

describe('sincronización por ancla', () => {
	test('caché vacía: la última página fija el cursor hacia lo antiguo', () => {
		const cache = applyNewerPages(emptyHistoryCache(), [{ items: [tx('c', 30), tx('b', 20)], next_cursor: 'p2' }], 1000)
		expect(cache.items.map(t => t.hash)).toEqual(['c', 'b'])
		expect(cache.olderCursor).toBe('p2')
		expect(cache.complete).toBe(false)
		expect(cache.updatedAt).toBe(1000)
	})

	test('con historial: lo nuevo se añade y el cursor antiguo se conserva', () => {
		const base = applyNewerPages(emptyHistoryCache(), [{ items: [tx('b', 20)], next_cursor: 'p2' }], 1)
		expect(overlapsCache(base, [tx('d', 40), tx('c', 30)])).toBe(false)
		expect(overlapsCache(base, [tx('c', 30), tx('b', 20)])).toBe(true)
		const next = applyNewerPages(base, [{ items: [tx('c', 30), tx('b', 20)], next_cursor: 'otro' }], 2)
		expect(next.items.map(t => t.hash)).toEqual(['c', 'b'])
		expect(next.olderCursor).toBe('p2')
	})

	test('hacia lo antiguo: añade y avanza; sin cursor = completo', () => {
		const base = applyNewerPages(emptyHistoryCache(), [{ items: [tx('c', 30)], next_cursor: 'p2' }], 1)
		const older = applyOlderPage(base, { items: [tx('a', 10)], next_cursor: null }, 2)
		expect(older.items.map(t => t.hash)).toEqual(['c', 'a'])
		expect(older.olderCursor).toBeNull()
		expect(older.complete).toBe(true)
	})
})
