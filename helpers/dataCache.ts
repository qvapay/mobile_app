// LEGACY: React Query's persister superseded this cache. The only live
// consumer is `clearDataCache()` on logout (purges orphaned `@qpcache:` keys
// from old installs). Do not add new users — new reads are React Query queries.
import AsyncStorage from '@react-native-async-storage/async-storage'

// Every cached slice lives under this prefix so logout can purge them all at once
const PREFIX = '@qpcache:'

// Bump to invalidate every cached slice after a breaking shape change
const CACHE_VERSION = 1

/** Envelope persisted for each slice: version + timestamp + data. */
type CacheEntry = { v?: number, t?: number, d?: unknown }

/**
 * Cache keys for every stale-while-revalidate surface. Data cached under these
 * keys is account-scoped UI state — it is purged on logout via `clearDataCache`.
 */
export const CACHE_KEYS = {
	HOME_TRANSACTIONS: 'home_transactions',
	HOME_QUICKPAY: 'home_quickpay',
	HOME_BLOG: 'home_blog',
	HOME_WATCHLIST: 'home_watchlist',
	HOME_PROMO: 'home_promo',
	TRANSACTIONS_FIRST_PAGE: 'transactions_first_page',
	SEND_CAROUSEL: 'send_carousel',
	P2P_OFFERS: 'p2p_offers',
	P2P_COINS: 'p2p_coins',
	// Catálogo de monedas por capacidad (depósito / retiro / todas): casi
	// estático, se sirve desde caché y se revalida por detrás — ver hooks/useCoins
	COINS_IN: 'coins_in',
	COINS_OUT: 'coins_out',
	COINS_ALL: 'coins_all',
	STORE_CATALOG: 'store_catalog',
	STORE_TOPUP_BRANDS: 'store_topup_brands', // + ':<countryCode>'
	MARKET_STORES: 'market_stores',
	MARKET_SHOP: 'market_shop', // + ':<slug>'
	MARKET_ORDERS: 'market_orders',
	INVEST_DATA: 'invest_data',
	SAVINGS_SUMMARY: 'savings_summary',
}

/**
 * Reads a cached slice. Returns null on miss, version mismatch, expiry or any
 * storage/parse error — callers can always trust a non-null result.
 *
 * @param key - One of CACHE_KEYS (optionally suffixed, e.g. `${key}:CU`).
 * @param options - `maxAgeMs` discards entries older than this (default: never expire).
 * @returns The cached data or null.
 */
export const readCache = async (key: string, { maxAgeMs }: { maxAgeMs?: number } = {}): Promise<unknown> => {
	try {
		const raw = await AsyncStorage.getItem(PREFIX + key)
		if (!raw) return null
		const entry = JSON.parse(raw) as CacheEntry
		if (entry?.v !== CACHE_VERSION) return null
		if (maxAgeMs && Date.now() - (entry.t || 0) > maxAgeMs) return null
		return entry.d ?? null
	} catch { return null }
}

/**
 * Reads several cached slices in one storage round-trip.
 *
 * @param keys - CACHE_KEYS entries.
 * @returns Map of key → cached data (missing/invalid keys resolve to null).
 */
export const readCacheMany = async (keys: string[]): Promise<Record<string, unknown>> => {
	const result: Record<string, unknown> = {}
	try {
		const raw = await AsyncStorage.getMany(keys.map(k => PREFIX + k))
		for (const key of keys) {
			result[key] = null
			const value = raw[PREFIX + key]
			if (!value) continue
			try {
				const entry = JSON.parse(value) as CacheEntry
				if (entry?.v === CACHE_VERSION) result[key] = entry.d ?? null
			} catch { /* corrupt entry — treat as miss */ }
		}
	} catch {
		for (const key of keys) result[key] = null
	}
	return result
}

/**
 * Persists a slice for the next cold start. Fire-and-forget: failures are
 * swallowed — the cache is an optimization, never a source of truth.
 *
 * @param key - One of CACHE_KEYS (optionally suffixed).
 * @param data - JSON-serializable payload.
 */
export const writeCache = (key: string, data: unknown): void => {
	try {
		const entry = JSON.stringify({ v: CACHE_VERSION, t: Date.now(), d: data })
		AsyncStorage.setItem(PREFIX + key, entry).catch(() => { })
	} catch { /* non-serializable payload — skip */ }
}

/**
 * Purges every `@qpcache:` entry. Called on logout so one account's
 * transactions/contacts never flash for the next.
 */
export const clearDataCache = async (): Promise<void> => {
	try {
		const keys = await AsyncStorage.getAllKeys()
		const mine = keys.filter(k => k.startsWith(PREFIX))
		if (mine.length) await AsyncStorage.removeMany(mine)
	} catch { /* purge failed — entries are account-scoped but harmless */ }
}
