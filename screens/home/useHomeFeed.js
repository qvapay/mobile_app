import FastImage from '@d11/react-native-fast-image'
import { useState, useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// APIs
import { transferApi } from '../../api/transferApi'
import { userApi } from '../../api/userApi'
import { blogApi } from '../../api/blogApi'
import { coinsApi } from '../../api/coinsApi'
import { promoApi } from '../../api/promoApi'

// Update prompt
import { maybePromptUpdate } from '../../helpers/versionCheck'

// Stale-while-revalidate cache (instant cold-start / offline rendering)
import { CACHE_KEYS, readCacheMany, writeCache } from '../../helpers/dataCache'

const WATCHLIST_COINS = ['BTC', 'ETH', 'LTC', 'SOL']

// A promo is time-boxed — never resurrect one older than a day
const PROMO_MAX_AGE_MS = 24 * 60 * 60 * 1000

// The home feed is a bag of independently-fetched sections — one reducer keeps them together
const initialFeed = { latestTransactions: [], latestSentTransfersUsers: [], latestBlogPosts: [], watchlistData: [], promo: null, updateInfo: null }

function feedReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
		case 'hydrate': {
			// Cached data must never clobber a fresh fetch that resolved first
			const current = state[action.field]
			const untouched = current == null || (Array.isArray(current) && current.length === 0)
			return untouched && action.value != null ? { ...state, [action.field]: action.value } : state
		}
		default:
			return state
	}
}

/**
 * Owns the Home feed data: fans out independent fetches on mount — profile
 * (`GET /user/extended`), latest transactions and quick-pay recipients
 * (`transferApi`), blog posts (WordPress REST), a 24h crypto watchlist
 * (BTC/ETH/LTC/SOL sparklines) and promo banners. `onRefresh` re-runs
 * everything plus the store-update check (`helpers/versionCheck`), whose
 * result lands in `updateInfo` for `UpdatePromptModal`.
 *
 * Stale-while-revalidate: every section hydrates instantly from the last
 * successful fetch persisted in AsyncStorage (`helpers/dataCache`), then the
 * network refresh overwrites it. A failed fetch (offline) leaves the cached
 * data on screen instead of an empty state; `txError` tells the screen the
 * transactions fetch failed so it can avoid the misleading "no transactions"
 * empty state when the list is simply unreachable.
 *
 * @returns {{
 *   latestTransactions: Array, latestSentTransfersUsers: Array,
 *   latestBlogPosts: Array, watchlistData: Array, promo: Object|null,
 *   updateInfo: Object|null, txLoading: boolean, txError: boolean,
 *   refreshing: boolean, onRefresh: Function, dismissUpdate: Function,
 * }}
 */
export default function useHomeFeed() {

	const { updateUser } = useAuth()

	const [, setIsLoading] = useState(false)
	const [txLoading, setTxLoading] = useState(true)
	const [txError, setTxError] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [feed, dispatchFeed] = useReducer(feedReducer, initialFeed)

	// Hydrate every section from the cold-start cache, then load fresh data.
	// The `hydrate` action is a no-op for sections whose fetch already resolved.
	useEffect(() => {
		const hydrate = async () => {
			const cached = await readCacheMany([
				CACHE_KEYS.HOME_TRANSACTIONS,
				CACHE_KEYS.HOME_QUICKPAY,
				CACHE_KEYS.HOME_BLOG,
				CACHE_KEYS.HOME_WATCHLIST,
				CACHE_KEYS.HOME_PROMO,
			])
			dispatchFeed({ type: 'hydrate', field: 'latestTransactions', value: cached[CACHE_KEYS.HOME_TRANSACTIONS] })
			dispatchFeed({ type: 'hydrate', field: 'latestSentTransfersUsers', value: cached[CACHE_KEYS.HOME_QUICKPAY] })
			dispatchFeed({ type: 'hydrate', field: 'latestBlogPosts', value: cached[CACHE_KEYS.HOME_BLOG] })
			dispatchFeed({ type: 'hydrate', field: 'watchlistData', value: cached[CACHE_KEYS.HOME_WATCHLIST] })
			const promo = cached[CACHE_KEYS.HOME_PROMO]
			if (promo && Date.now() - (promo.cachedAt || 0) <= PROMO_MAX_AGE_MS) {
				dispatchFeed({ type: 'hydrate', field: 'promo', value: promo.data })
			}
			// Cached transactions on screen — no skeleton needed while revalidating
			if (cached[CACHE_KEYS.HOME_TRANSACTIONS]?.length) setTxLoading(false)
		}
		hydrate()
		loadUserData()
		fetchLatestTransactions()
		fetchLatestSentTransfersUsers()
		fetchLatestBlogPosts()
		fetchWatchlist()
		fetchPromo()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Load user data from API
	const loadUserData = async () => {
		try {
			setIsLoading(true)
			const result = await userApi.getUserProfile()
			if (result.success && result.data) { updateUser(result.data) }
		} catch (err) { /* error loading user data */ }
		finally { setIsLoading(false) }
	}

	const fetchLatestTransactions = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await transferApi.getLatestTransactions({ take: 6 })
			if (result.success) {
				setTxError(false)
				dispatchFeed({ type: 'set', field: 'latestTransactions', value: result.data })
				writeCache(CACHE_KEYS.HOME_TRANSACTIONS, result.data)
				// Preload avatar images for instant rendering
				const avatarUrls = result.data.flatMap(t => {
					const img = (t.paid_by_user || t.user)?.image
					return img ? [{ uri: `https://media.qvapay.com/${img}` }] : []
				})
				if (avatarUrls.length > 0) FastImage.preload(avatarUrls)
			} else { setTxError(true) }
		} catch (err) { setTxError(true) }
		finally {
			if (!skipLoading) setIsLoading(false)
			setTxLoading(false)
		}
	}

	const fetchLatestSentTransfersUsers = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await transferApi.getLatestSentTransfers(10)
			if (result.success) {
				// filter out users with no image
				const users = result.data.filter(u => u.image)
				dispatchFeed({ type: 'set', field: 'latestSentTransfersUsers', value: users })
				writeCache(CACHE_KEYS.HOME_QUICKPAY, users)
			}
		} catch (err) { /* error fetching sent transfers */ }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchLatestBlogPosts = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await blogApi.getLatestPosts(Platform.isPad ? 4 : 3)
			if (result.success) {
				dispatchFeed({ type: 'set', field: 'latestBlogPosts', value: result.data })
				writeCache(CACHE_KEYS.HOME_BLOG, result.data)
			}
		} catch (err) { console.error('[Home] blog fetch threw', err) }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchWatchlist = async () => {
		try {
			const results = await Promise.all(
				WATCHLIST_COINS.map(tick => coinsApi.priceHistory(tick, '24H'))
			)
			const data = results.map((result, i) => {
				const tick = WATCHLIST_COINS[i]
				if (!result.success || !result.data?.length) {
					return { tick, price: 0, change: 0, priceHistory: [] }
				}
				const history = result.data
				const first = history[0].value
				const last = history[history.length - 1].value
				const change = first > 0 ? ((last - first) / first) * 100 : 0
				return { tick, price: last, change, priceHistory: history }
			})
			// Offline every fetch fails and data is all zeroed placeholders —
			// keep whatever is on screen (cached prices) instead
			if (data.some(c => c.priceHistory.length)) {
				dispatchFeed({ type: 'set', field: 'watchlistData', value: data })
				writeCache(CACHE_KEYS.HOME_WATCHLIST, data)
			}
		} catch { /* error fetching watchlist */ }
	}

	const fetchPromo = async () => {
		try {
			const result = await promoApi.getPromo()
			if (result.success && result.data) {
				dispatchFeed({ type: 'set', field: 'promo', value: result.data })
				writeCache(CACHE_KEYS.HOME_PROMO, { data: result.data, cachedAt: Date.now() })
			}
		} catch { /* no promo available */ }
	}

	// Refresh handler for pull-to-refresh
	const onRefresh = async () => {
		setRefreshing(true)
		try {
			// Refresh user data
			await loadUserData()
			// Refresh latest transactions
			await fetchLatestTransactions(true)
			// Refresh latest sent transfers users
			await fetchLatestSentTransfersUsers(true)
			// Refresh latest blog posts
			await fetchLatestBlogPosts(true)
			// Refresh watchlist
			await fetchWatchlist()
			// Refresh promo
			await fetchPromo()
			// Check for store update
			const info = await maybePromptUpdate()
			if (info?.needsUpdate) dispatchFeed({ type: 'set', field: 'updateInfo', value: info })
		} catch (err) { /* error refreshing data */ }
		finally { setRefreshing(false) }
	}

	// Dismiss the store-update prompt
	const dismissUpdate = () => dispatchFeed({ type: 'set', field: 'updateInfo', value: null })

	return { ...feed, txLoading, txError, refreshing, onRefresh, dismissUpdate }
}
