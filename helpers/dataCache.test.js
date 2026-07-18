/**
 * Unit tests for the stale-while-revalidate cold-start cache — node
 * environment with AsyncStorage mocked (see keypadAmount.test.js for why).
 * @jest-environment node
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	getMany: jest.fn(),
	getAllKeys: jest.fn(),
	removeMany: jest.fn(),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { CACHE_KEYS, readCache, readCacheMany, writeCache, clearDataCache } from './dataCache'

const entry = (data, t = Date.now()) => JSON.stringify({ v: 1, t, d: data })

beforeEach(() => {
	jest.clearAllMocks()
	AsyncStorage.setItem.mockResolvedValue()
	AsyncStorage.removeMany.mockResolvedValue()
})

describe('readCache', () => {
	it('returns the cached payload under the prefixed key', async () => {
		AsyncStorage.getItem.mockResolvedValue(entry([{ uuid: 'tx1' }]))
		const data = await readCache(CACHE_KEYS.HOME_TRANSACTIONS)
		expect(AsyncStorage.getItem).toHaveBeenCalledWith('@qpcache:home_transactions')
		expect(data).toEqual([{ uuid: 'tx1' }])
	})

	it('returns null on a miss', async () => {
		AsyncStorage.getItem.mockResolvedValue(null)
		expect(await readCache('nope')).toBeNull()
	})

	it('returns null on corrupt JSON', async () => {
		AsyncStorage.getItem.mockResolvedValue('{oops')
		expect(await readCache('bad')).toBeNull()
	})

	it('returns null on a version mismatch', async () => {
		AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ v: 99, t: Date.now(), d: [1] }))
		expect(await readCache('old')).toBeNull()
	})

	it('returns null when the entry is older than maxAgeMs', async () => {
		AsyncStorage.getItem.mockResolvedValue(entry({ id: 1 }, Date.now() - 60_000))
		expect(await readCache('stale', { maxAgeMs: 30_000 })).toBeNull()
	})

	it('returns the entry when younger than maxAgeMs', async () => {
		AsyncStorage.getItem.mockResolvedValue(entry({ id: 1 }, Date.now() - 10_000))
		expect(await readCache('fresh', { maxAgeMs: 30_000 })).toEqual({ id: 1 })
	})

	it('returns null when storage throws', async () => {
		AsyncStorage.getItem.mockRejectedValue(new Error('disk'))
		expect(await readCache('boom')).toBeNull()
	})
})

describe('readCacheMany', () => {
	it('maps each key to its payload, with null for misses and corrupt entries', async () => {
		AsyncStorage.getMany.mockResolvedValue({
			'@qpcache:a': entry([1, 2]),
			'@qpcache:b': null,
			'@qpcache:c': '{oops',
		})
		const result = await readCacheMany(['a', 'b', 'c'])
		expect(AsyncStorage.getMany).toHaveBeenCalledWith(['@qpcache:a', '@qpcache:b', '@qpcache:c'])
		expect(result).toEqual({ a: [1, 2], b: null, c: null })
	})

	it('resolves every key to null when storage throws', async () => {
		AsyncStorage.getMany.mockRejectedValue(new Error('disk'))
		expect(await readCacheMany(['a', 'b'])).toEqual({ a: null, b: null })
	})
})

describe('writeCache', () => {
	it('persists a versioned, timestamped envelope under the prefixed key', () => {
		writeCache('home_quickpay', [{ uuid: 'u1' }])
		expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)
		const [key, raw] = AsyncStorage.setItem.mock.calls[0]
		expect(key).toBe('@qpcache:home_quickpay')
		const parsed = JSON.parse(raw)
		expect(parsed.v).toBe(1)
		expect(typeof parsed.t).toBe('number')
		expect(parsed.d).toEqual([{ uuid: 'u1' }])
	})

	it('never throws when the write fails', () => {
		AsyncStorage.setItem.mockRejectedValue(new Error('full'))
		expect(() => writeCache('k', { a: 1 })).not.toThrow()
	})

	it('round-trips through readCache', async () => {
		writeCache('rt', { hello: 'mundo' })
		const [, raw] = AsyncStorage.setItem.mock.calls[0]
		AsyncStorage.getItem.mockResolvedValue(raw)
		expect(await readCache('rt')).toEqual({ hello: 'mundo' })
	})
})

describe('clearDataCache', () => {
	it('removes only @qpcache: keys, leaving other storage intact', async () => {
		AsyncStorage.getAllKeys.mockResolvedValue(['user_data', '@qpcache:a', 'push_banner_last_dismiss', '@qpcache:b'])
		await clearDataCache()
		expect(AsyncStorage.removeMany).toHaveBeenCalledWith(['@qpcache:a', '@qpcache:b'])
	})

	it('skips the removal call when nothing is cached', async () => {
		AsyncStorage.getAllKeys.mockResolvedValue(['user_data'])
		await clearDataCache()
		expect(AsyncStorage.removeMany).not.toHaveBeenCalled()
	})

	it('never throws when storage fails', async () => {
		AsyncStorage.getAllKeys.mockRejectedValue(new Error('disk'))
		await expect(clearDataCache()).resolves.toBeUndefined()
	})
})
