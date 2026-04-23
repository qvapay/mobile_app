import { useQuery } from '@tanstack/react-query'
import { coinsApi } from '../../../api/coinsApi'

const WATCHLIST_COINS = ['BTC', 'ETH', 'LTC', 'SOL']

export const homeWatchlistQueryKey = ['home', 'watchlist', '24H']

export const useHomeWatchlist = () => useQuery({
	queryKey: homeWatchlistQueryKey,
	queryFn: async () => {
		const results = await Promise.all(
			WATCHLIST_COINS.map(tick => coinsApi.priceHistory(tick, '24H'))
		)

		return results.map((result, index) => {
			const tick = WATCHLIST_COINS[index]
			if (!result.success || !result.data?.length) {
				return { tick, price: 0, change: 0, priceHistory: [] }
			}

			const history = result.data
			const first = history[0].value
			const last = history[history.length - 1].value
			const change = first > 0 ? ((last - first) / first) * 100 : 0

			return {
				tick,
				price: last,
				change,
				priceHistory: history,
			}
		})
	},
	placeholderData: previousData => previousData,
})

