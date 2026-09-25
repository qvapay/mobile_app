import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { WalletAddresses } from '../wallet/derive'
import type { GaslessQuote, GaslessSubmitResult, SponsorGrantState, WalletHistoryPage } from '../types/domain'

/** Parámetros de `GET /wallet/history` (una página del historial de UN activo en UNA red). */
export type WalletHistoryParams = {
	/** chainKey del registry: ethereum | bsc | base | polygon | tron | bitcoin. */
	chain: string
	address: string
	/** 'native' o la dirección del contrato del token. */
	asset: string
	cursor?: string | null
	/** Salta la caché del proxy (tras un envío propio o pull-to-refresh). */
	fresh?: boolean
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

			// Solo direcciones: la clave pública Stacks es metadata local, no se registra
			const { evm, tron, btc, stx, sol } = addresses
			const response = await apiClient.post('/wallet/addresses', { evm, tron, btc, stx, sol }, { silent: true })
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
	getHistory: async ({ chain, address, asset, cursor, fresh }: WalletHistoryParams): Promise<ApiResult<WalletHistoryPage>> => {

		try {

			const params: Record<string, string> = { chain, address, asset }
			if (cursor) params.cursor = cursor
			if (fresh) params.fresh = '1'
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

	/**
	 * Pide permiso para que QvaPay pague el fee de UN envío (`POST /wallet/gasless/quote`).
	 *
	 * Un `eligible: false` NO es un error: llega con 200 y su motivo, porque el usuario
	 * puede enviar igual pagando su gas y la pantalla necesita saber qué contarle.
	 */
	gaslessQuote: async (input: { to: string, mint: string, amount: string, idempotencyKey: string }): Promise<ApiResult<GaslessQuote>> => {
		try {
			const response = await apiClient.post<GaslessQuote>('/wallet/gasless/quote', {
				to: input.to, mint: input.mint, amount: input.amount, idempotency_key: input.idempotencyKey,
			}, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return gaslessFail(err, 'api.wallet.gaslessQuoteFailed') }
	},

	/**
	 * Manda la transacción firmada por el usuario (`POST /wallet/gasless/{uuid}/submit`).
	 * La difunde el backend tras co-firmarla: desde la app NUNCA sale a la red.
	 *
	 * Puede tardar ~35s (el patrocinador hace preflight, simulación y espera confirmación).
	 */
	gaslessSubmit: async (uuid: string, txBase64: string): Promise<ApiResult<GaslessSubmitResult>> => {
		try {
			const response = await apiClient.post<GaslessSubmitResult>(`/wallet/gasless/${uuid}/submit`, { tx: txBase64 }, { timeout: GASLESS_SUBMIT_TIMEOUT_MS })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return gaslessFail(err, 'api.wallet.gaslessSubmitFailed') }
	},

	/** Devuelve el permiso a la cuota del día al salir sin enviar. Best-effort. */
	gaslessCancel: async (uuid: string): Promise<ApiResult<{ cancelled: boolean }>> => {
		try {
			const response = await apiClient.post<{ cancelled: boolean }>(`/wallet/gasless/${uuid}/cancel`, {}, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return gaslessFail(err, 'api.common.networkError') }
	},

	/** Estado de un permiso: es lo que se consulta tras un `pending`. */
	gaslessGet: async (uuid: string): Promise<ApiResult<SponsorGrantState>> => {
		try {
			const response = await apiClient.get<{ data: SponsorGrantState }>(`/wallet/gasless/${uuid}`, { silent: true })
			return { success: true, data: response.data?.data, status: response.status }
		} catch (err) { return gaslessFail(err, 'api.common.networkError') }
	},
}

/**
 * Timeout largo a propósito: el patrocinador espera la confirmación on-chain. Cortar
 * antes no cancela nada al otro lado, solo deja al usuario sin saber si se envió.
 */
const GASLESS_SUBMIT_TIMEOUT_MS = 90_000

const gaslessFail = (err: unknown, fallbackKey: string): ApiResult<never> => {
	const error = err as ApiClientError
	if (error.response?.data) {
		const errorData = error.response.data
		return { success: false, error: errorData.error || errorData.message || i18n.t(fallbackKey), details: errorData, status: error.response.status }
	}
	return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
}
