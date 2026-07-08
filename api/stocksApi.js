import { apiClient } from './client'

// Market data for the Invest screen. Quotes are proxied (and cached) by the
// QvaPay backend, so no third-party market API keys live in the app.
export const stocksApi = {
	/**
	 * Gets current quotes for all tracked stocks (`GET /stocks/index`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is an array of `{ symbol, name, icon, iconStyle, price, change, changeDollar, volume, timestamp }`
	 */
	index: async () => {
		try {
			const response = await apiClient.get('/stocks/index')
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) { return { success: false, error: error.response.data.error || 'No se pudieron obtener las acciones', status: error.response.status } }
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets an extended quote + company profile for one stock
	 * (`GET /stocks/{tick}?type=quote`).
	 *
	 * @param {string} tick - Stock ticker (e.g., 'AAPL')
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ symbol, name, price, change, changeDollar, open, high, low, previousClose, volume, fiftyTwoWeekHigh, fiftyTwoWeekLow, exchange, type, description, sector, industry, ceo }`
	 */
	show: async (tick) => {
		try {
			const response = await apiClient.get(`/stocks/${tick}?type=quote`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) { return { success: false, error: error.response.data.error || 'No se pudo obtener la cotización', status: error.response.status } }
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets price history for a stock, used by the sparkline/detail charts
	 * (`GET /stocks/{tick}?timeframe=...`).
	 *
	 * @param {string} tick - Stock ticker (e.g., 'AAPL', 'GOOGL')
	 * @param {string} [timeframe='24H'] - Timeframe: '1H', '24H', '1W', '1M', '1Y'
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is an array of `{ time, value }` points
	 */
	priceHistory: async (tick, timeframe = '24H') => {
		try {
			const response = await apiClient.get(`/stocks/${tick}?timeframe=${timeframe}`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) { return { success: false, error: error.response.data.error || 'No se pudo obtener el historial', status: error.response.status } }
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},
}
