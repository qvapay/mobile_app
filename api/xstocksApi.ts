import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Precios de Jupiter (API pública, sin clave): incluye datos de mercado de los xStocks. */
const JUPITER_PRICE_URL = 'https://lite-api.jup.ag/price/v3'
const PRICE_TIMEOUT_MS = 10_000

/** Lo que interesa de una entrada de `/price/v3` para un xStock. */
export type JupiterPriceEntry = {
	/** USD por ACCIÓN (unidad escalada por el multiplicador de dividendos). */
	usdPrice?: number
	priceChange24h?: number | null
	liquidity?: number | null
	stockData?: { price?: number, mcap?: number, updatedAt?: string } | null
	/** Solo en mints con Scaled UI: USD por unidad CRUDA del token. */
	scaledUiConfig?: { usdPricePrescaled?: number } | null
}

export type StocksAvailability = { available: boolean }

/**
 * Acciones tokenizadas (xStocks) de la wallet: disponibilidad por región (qpweb) y precios en
 * vivo (Jupiter). Ninguna llamada exige sesión: la wallet funciona sin cuenta de QvaPay.
 */
export const xstocksApi = {
	/**
	 * ¿Se ofrecen acciones desde aquí? (`GET /wallet/stocks`). Lo decide el país de la IP;
	 * fuera de región la app esconde la sección entera.
	 *
	 * @returns `{ success, data: { available }, error?, status? }`
	 */
	availability: async (): Promise<ApiResult<StocksAvailability>> => {
		try {
			const response = await apiClient.get('/wallet/stocks', { silent: true, anonymous: true })
			return { success: true, data: { available: response.data?.data?.available === true }, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.response?.data?.error || error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Precios por mint (`GET lite-api.jup.ag/price/v3?ids=…`, máx. 50 ids). Va directo del
	 * teléfono a Jupiter: son datos públicos y así el precio no depende de que qpweb esté arriba.
	 *
	 * @param mints - Mints de los xStocks
	 * @returns `{ success, data: { [mint]: entry }, error?, status? }`
	 */
	prices: async (mints: readonly string[]): Promise<ApiResult<Record<string, JupiterPriceEntry>>> => {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), PRICE_TIMEOUT_MS)
		try {
			const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mints.join(',')}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
			if (!response.ok) { return { success: false, error: i18n.t('api.common.networkError'), status: response.status } }
			const data = await response.json() as Record<string, JupiterPriceEntry | null>
			const clean: Record<string, JupiterPriceEntry> = {}
			for (const [mint, entry] of Object.entries(data || {})) { if (entry) clean[mint] = entry }
			return { success: true, data: clean, status: response.status }
		} catch (err) {
			return { success: false, error: (err as Error)?.message || i18n.t('api.common.networkError') }
		} finally {
			clearTimeout(timer)
		}
	},
}
