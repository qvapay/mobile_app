import { apiClient } from './client'

export const stocksApi = {
	/**
	 * Get current quotes for all tracked stocks
	 * @returns {Promise<Object>} Array of { symbol, name, icon, iconStyle, price, change, changeDollar, volume, timestamp }
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
	 * Get extended quote + profile for a stock
	 * @param {string} tick - Stock ticker (e.g., 'AAPL')
	 * @returns {Promise<Object>} { symbol, name, price, change, changeDollar, open, high, low, previousClose, volume, fiftyTwoWeekHigh, fiftyTwoWeekLow, exchange, type, description, sector, industry, ceo }
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
	 * Get price history for a stock
	 * @param {string} tick - Stock ticker (e.g., 'AAPL', 'GOOGL')
	 * @param {string} timeframe - Timeframe: '1H', '24H', '1W', '1M', '1Y'
	 * @returns {Promise<Object>} Array of { time, value }
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

export default stocksApi
