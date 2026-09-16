import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { Swap, SwapPairsPayload } from '../types/domain'

/** `POST /swap` — saldo → wallet (`out`, PIN de cuenta) o wallet → saldo (`in`, tx patrocinada firmada). */
export type SwapCreateInput =
	| { direction: 'out', pair: string, amount: string | number, toAddress: string, pin: string | number, idempotencyKey: string }
	| { direction: 'in', pair: string, amount: string | number, signedTx: string, asset: string, idempotencyKey: string }

/** Respuesta de `POST /swap` y `GET /swap/{uuid}`. */
export type SwapPayload = { data: Swap, balance?: number, duplicate?: boolean }

const fail = (err: unknown, fallbackKey: string): ApiResult<never> => {
	const error = err as ApiClientError
	if (error.response?.data) {
		const errorData = error.response.data
		return { success: false, error: errorData.error || errorData.message || i18n.t(fallbackKey), details: errorData, status: error.response.status }
	}
	return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
}

/**
 * Swap saldo QvaPay ↔ QUSD on-chain (Stacks), 1:1 sin comisión. La tesorería y el asset
 * salen de `getPairs` (nunca del registry local): el contrato cambia de versión por config.
 * `details` conserva el body de error: `code` (`DUPLICATE_REQUEST`, `LIMIT_EXCEEDED`,
 * `SPONSOR_BUDGET`, `ORIGIN_NONCE_MISMATCH`…) y `reason` (`limit` | `sponsor_budget` | `nonce`).
 */
export const swapApi = {

	/** Pares + límites restantes del usuario + presupuesto de patrocinio + su `stx` registrada. */
	getPairs: async (): Promise<ApiResult<SwapPairsPayload>> => {
		try {
			const response = await apiClient.get('/swap/pairs', { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.common.networkError') }
	},

	/**
	 * Crea el swap. 201 con la fila `pending`; replay de una clave ya materializada → 200
	 * con `duplicate: true` (éxito). `pin` viaja como string (ceros a la izquierda del TOTP).
	 */
	create: async (input: SwapCreateInput): Promise<ApiResult<SwapPayload>> => {
		try {
			const payload = input.direction === 'out'
				? { pair: input.pair, direction: 'out', amount: Number(input.amount), to_address: input.toAddress, pin: String(input.pin), idempotency_key: input.idempotencyKey }
				: { pair: input.pair, direction: 'in', amount: Number(input.amount), signed_tx: input.signedTx, asset: input.asset, idempotency_key: input.idempotencyKey }
			const response = await apiClient.post('/swap', payload)
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.swap.createFailed') }
	},

	/** Estado de un swap (polling cada 5 s hasta completed | failed | refunded | needs_review). */
	get: async (uuid: string): Promise<ApiResult<SwapPayload>> => {
		try {
			const response = await apiClient.get(`/swap/${uuid}`, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.common.networkError') }
	},

	/** Cancela un OUT aún `pending` (reembolso inmediato). */
	cancel: async (uuid: string): Promise<ApiResult<SwapPayload>> => {
		try {
			const response = await apiClient.delete(`/swap/${uuid}`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.swap.cancelFailed') }
	},
}
