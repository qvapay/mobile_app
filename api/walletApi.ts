import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { WalletAddresses } from '../wallet/derive'

/**
 * ÚNICO endpoint de backend de la wallet self-custody: registrar las
 * direcciones PÚBLICAS del usuario (push de depósitos entrantes, KYT).
 * Ninguna llave ni firma pasa jamás por aquí — la app habla con las cadenas
 * directamente vía wallet/registry.
 */
export const walletApi = {
	/**
	 * Registra las direcciones derivadas (`POST /wallet/addresses`).
	 * Best-effort: la wallet funciona igual si esto falla o aún no existe
	 * en el backend — los callers lo tratan como fire-and-forget.
	 *
	 * @param addresses - Direcciones públicas por familia (evm/tron/btc)
	 * @returns `{ success, data?, error?, status? }`
	 */
	registerAddresses: async (addresses: WalletAddresses): Promise<ApiResult> => {

		try {

			const response = await apiClient.post('/wallet/addresses', addresses, { silent: true })
			return { success: true, data: response.data, status: response.status }

		} catch (err) {

			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.common.networkError'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError') }
		}
	},
}
