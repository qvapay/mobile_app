import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { Coin } from '../types/domain'

/** Punto del histórico de precios que pintan los sparklines. */
export type PricePoint = { time: string | number, value: number }

/** Flags de query aceptados por `/coins/v2` (se anexan tal cual al query string). */
export type CoinFilters = Record<string, string | number | boolean | null | undefined>

// Coins API functions
export const coinsApi = {
	/**
	 * Lists the coins/payment rails the platform supports (`GET /coins/v2`).
	 * Filter by capability with flags like `{ enabled_in: true }` (deposits),
	 * `{ enabled_out: true }` (withdrawals) or `{ enabled_p2p: true }` (P2P offers).
	 *
	 * @param filters - Optional query filters, appended as-is to the query string
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the coins list
	 */
	index: async (filters: CoinFilters = {}): Promise<ApiResult<Coin[]>> => {

		try {

			const params = new URLSearchParams()
			Object.entries(filters).forEach(([key, value]) => {
				if (value !== undefined && value !== null) {
					params.append(key, String(value))
				}
			})
			const query = params.toString()
			const url = query ? `/coins/v2?${query}` : '/coins/v2'
			const response = await apiClient.get<Coin[]>(url)

			return { success: true, data: response.data, status: response.status }

		} catch (err) {

			const error = err as ApiClientError
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
	 * @param tick - Coin ticker (e.g., 'BTC', 'ETH')
	 * @param timeframe - Timeframe for history (e.g., '24H', '7D', '30D')
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is an array of `{ time, value }` points
	 */
	priceHistory: async (tick: string, timeframe: string = '24H'): Promise<ApiResult<PricePoint[]>> => {
		try {
			const response = await apiClient.get<PricePoint[]>(`/coins/price-history/${tick}?timeframe=${timeframe}`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
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
