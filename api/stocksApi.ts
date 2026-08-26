import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { PricePoint } from './coinsApi'

// Market data for the Invest screen. Quotes are proxied (and cached) by the
// QvaPay backend, so no third-party market API keys live in the app.
export const stocksApi = {
	/**
	 * Gets current quotes for all tracked stocks (`GET /stocks/index`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is an array of `{ symbol, name, icon, iconStyle, price, change, changeDollar, volume, timestamp }`
	 */
	index: async (): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get('/stocks/index')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) { return { success: false, error: error.response.data.error || i18n.t('api.stocks.stocksLoadFailed'), status: error.response.status } }
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets an extended quote + company profile for one stock
	 * (`GET /stocks/{tick}?type=quote`).
	 *
	 * @param tick - Stock ticker (e.g., 'AAPL')
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ symbol, name, price, change, changeDollar, open, high, low, previousClose, volume, fiftyTwoWeekHigh, fiftyTwoWeekLow, exchange, type, description, sector, industry, ceo }`
	 */
	show: async (tick: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/stocks/${tick}?type=quote`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) { return { success: false, error: error.response.data.error || i18n.t('api.stocks.quoteLoadFailed'), status: error.response.status } }
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets price history for a stock, used by the sparkline/detail charts
	 * (`GET /stocks/{tick}?timeframe=...`).
	 *
	 * @param tick - Stock ticker (e.g., 'AAPL', 'GOOGL')
	 * @param timeframe - Timeframe: '1H', '24H', '1W', '1M', '1Y'
	 * @returns `{ success, data?, error?, status? }` — `data` is an array of `{ time, value }` points
	 */
	priceHistory: async (tick: string, timeframe: string = '24H'): Promise<ApiResult<PricePoint[]>> => {
		try {
			const response = await apiClient.get(`/stocks/${tick}?timeframe=${timeframe}`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) { return { success: false, error: error.response.data.error || i18n.t('api.stocks.historyLoadFailed'), status: error.response.status } }
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}
