import { apiClient } from './client'
import i18n from '../i18n'

// Coins API functions
export const coinsApi = {
	/**
	 * Lists the coins/payment rails the platform supports (`GET /coins/v2`).
	 * Filter by capability with flags like `{ enabled_in: true }` (deposits),
	 * `{ enabled_out: true }` (withdrawals) or `{ enabled_p2p: true }` (P2P offers).
	 *
	 * @param {Object} [filters] - Optional query filters, appended as-is to the query string
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the coins list (tick, name, price, fees, logo, working_data)
	 */
	index: async (filters = {}) => {

		try {

			const params = new URLSearchParams()
			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					params.append(key, String(value))
				}
			})
			const query = params.toString()
			const url = query ? `/coins/v2?${query}` : '/coins/v2'
			const response = await apiClient.get(url)

			return { success: true, data: response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.coins.coinsLoadFailed'), details: errorData, status: error.response.status }
			}

			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets price history for a coin (`GET /coins/price-history/{tick}`),
	 * used by the sparkline charts.
	 *
	 * @param {string} tick - Coin ticker (e.g., 'BTC', 'ETH')
	 * @param {string} [timeframe='24H'] - Timeframe for history (e.g., '24H', '7D', '30D')
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is an array of `{ time, value }` points
	 */
	priceHistory: async (tick, timeframe = '24H') => {
		try {
			const response = await apiClient.get(`/coins/price-history/${tick}?timeframe=${timeframe}`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.coins.priceHistoryLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}

// Export default for convenience
export default coinsApi
