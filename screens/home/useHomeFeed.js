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

const WATCHLIST_COINS = ['BTC', 'ETH', 'LTC', 'SOL']

// The home feed is a bag of independently-fetched sections — one reducer keeps them together
const initialFeed = { latestTransactions: [], latestSentTransfersUsers: [], latestBlogPosts: [], watchlistData: [], promo: null, updateInfo: null }

function feedReducer(state, action) {
	switch (action.type) {
		case 'set':
			return { ...state, [action.field]: action.value }
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
 * @returns {{
 *   latestTransactions: Array, latestSentTransfersUsers: Array,
 *   latestBlogPosts: Array, watchlistData: Array, promo: Object|null,
 *   updateInfo: Object|null, txLoading: boolean, refreshing: boolean,
 *   onRefresh: Function, dismissUpdate: Function,
 * }}
 */
export default function useHomeFeed() {

	const { updateUser } = useAuth()

	const [, setIsLoading] = useState(false)
	const [txLoading, setTxLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [feed, dispatchFeed] = useReducer(feedReducer, initialFeed)

	// Load user data
	useEffect(() => {
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
				dispatchFeed({ type: 'set', field: 'latestTransactions', value: result.data })
				// Preload avatar images for instant rendering
				const avatarUrls = result.data.flatMap(t => {
					const img = (t.paid_by_user || t.user)?.image
					return img ? [{ uri: `https://media.qvapay.com/${img}` }] : []
				})
				if (avatarUrls.length > 0) FastImage.preload(avatarUrls)
			}
		} catch (err) { /* error fetching transactions */ }
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
			}
		} catch (err) { /* error fetching sent transfers */ }
		finally { if (!skipLoading) setIsLoading(false) }
	}

	const fetchLatestBlogPosts = async (skipLoading = false) => {
		try {
			if (!skipLoading) setIsLoading(true)
			const result = await blogApi.getLatestPosts(Platform.isPad ? 4 : 3)
			if (result.success) { dispatchFeed({ type: 'set', field: 'latestBlogPosts', value: result.data }) }
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
			dispatchFeed({ type: 'set', field: 'watchlistData', value: data })
		} catch { /* error fetching watchlist */ }
	}

	const fetchPromo = async () => {
		try {
			const result = await promoApi.getPromo()
			if (result.success && result.data) { dispatchFeed({ type: 'set', field: 'promo', value: result.data }) }
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

	return { ...feed, txLoading, refreshing, onRefresh, dismissUpdate }
}
