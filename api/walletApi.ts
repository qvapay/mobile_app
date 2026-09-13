import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { WalletAddresses } from '../wallet/derive'
import type { WalletHistoryPage } from '../types/domain'

/** Parámetros de `GET /wallet/history` (una página del historial de UN activo en UNA red). */
export type WalletHistoryParams = {
	/** chainKey del registry: ethereum | bsc | base | polygon | tron | bitcoin. */
	chain: string
	address: string
	/** 'native' o la dirección del contrato del token. */
	asset: string
	cursor?: string | null
}

/**
 * Backend de la wallet self-custody: registrar las direcciones PÚBLICAS del
 * usuario (push de depósitos entrantes, KYT) y leer el historial on-chain por
 * un proxy fino (un RPC estándar no lista transferencias nativas entrantes).
 * Ninguna llave ni firma pasa jamás por aquí; los saldos y, en la Fase 4, el
 * broadcast van del teléfono a la cadena vía wallet/registry.
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

	/**
	 * Una página del historial de un activo (`GET /wallet/history`), más
	 * reciente primero. 503 = el proveedor del backend no está configurado;
	 * 404 = backend sin desplegar: la UI ofrece el explorador en ambos casos.
	 *
	 * @returns `{ success, data: { items, next_cursor }, error?, status? }`
	 */
	getHistory: async ({ chain, address, asset, cursor }: WalletHistoryParams): Promise<ApiResult<WalletHistoryPage>> => {

		try {

			const params: Record<string, string> = { chain, address, asset }
			if (cursor) params.cursor = cursor
			const response = await apiClient.get('/wallet/history', { params, silent: true })
			return { success: true, data: response.data?.data ?? { items: [], next_cursor: null }, status: response.status }

		} catch (err) {

			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.common.networkError'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}
