import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { PricePoint } from './coinsApi'

// Histórico de precio de una acción por su ticker de bolsa (`TSLA`): el gráfico de
// XStockDetail. Lo sirve (y cachea) el backend de QvaPay, así que en la app no vive
// ninguna clave de un proveedor de mercado. Los precios en vivo de las xStocks salen
// de Jupiter (`xstocksApi`).
export const stocksApi = {
	/**
	 * Gets price history for a stock, used by the XStockDetail chart
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
