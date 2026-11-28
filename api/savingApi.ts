import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { SavingsMovement, SavingsSummary } from '../types/domain'
import { runIdempotent } from '../helpers/idempotency'

/**
 * Un movimiento de ahorros (`POST /saving/deposit|withdraw`) con la clave de idempotencia
 * atada a sus datos: repetirlo tras un corte devuelve el movimiento original con
 * `duplicate: true` en vez de hacerlo dos veces.
 */
const move = (kind: 'deposit' | 'withdraw', amount: number, description: string, fallbackError: () => string): Promise<ApiResult<unknown>> => {
	const body = { amount, description }
	return runIdempotent(`saving:${kind}`, body, async (key): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post(`/saving/${kind}`, { ...body, idempotency_key: key })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || fallbackError(), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	})
}

export const savingApi = {
	/**
	 * Gets the savings account summary (`GET /saving`).
	 * Unwraps `response.data.data` when the payload is nested.
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data` holds balance, totals (deposited/withdrawn/earned), rate and Roundup state
	 */
	getSummary: async (): Promise<ApiResult<SavingsSummary>> => {
		try {
			const response = await apiClient.get('/saving')
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.saving.summaryLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Toggles automatic Roundup (`POST /saving/roundup`) — when enabled,
	 * payments are rounded up and the spare change lands in savings.
	 *
	 * @param enabled - Whether roundup is active
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	updateRoundup: async (enabled: boolean): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/saving/roundup', { enabled })
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.saving.roundupUpdateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Moves funds from the main balance into savings (`POST /saving/deposit`).
	 * Lleva `idempotency_key` atada al importe (ver `move`).
	 *
	 * @param amount - Amount to deposit
	 * @param description - Optional description
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	deposit: async (amount: number, description: string = ''): Promise<ApiResult<unknown>> => move('deposit', amount, description, () => i18n.t('api.saving.depositFailed')),

	/**
	 * Moves funds from savings back to the main balance (`POST /saving/withdraw`).
	 * Lleva `idempotency_key` atada al importe (ver `move`).
	 *
	 * @param amount - Amount to withdraw
	 * @param description - Optional description
	 * @returns `{ success, data?, error?, details?, status? }`
	 */
	withdraw: async (amount: number, description: string = ''): Promise<ApiResult<unknown>> => move('withdraw', amount, description, () => i18n.t('api.saving.withdrawFailed')),

	/**
	 * Gets the savings movement history — deposits, withdrawals, roundups,
	 * earnings (`GET /saving/transactions`).
	 *
	 * @param limit - Max results
	 * @param offset - Offset for pagination
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the transactions list
	 */
	getTransactions: async (limit: number = 50, offset: number = 0): Promise<ApiResult<SavingsMovement[]>> => {
		try {
			const response = await apiClient.get(`/saving/transactions?limit=${limit}&offset=${offset}`)
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.saving.transactionsLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets the interest earnings history, credited by the savings-earnings
	 * cron (`GET /saving/earnings`).
	 *
	 * @param limit - Max results
	 * @param offset - Offset for pagination
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is the earnings list
	 */
	getEarnings: async (limit: number = 12, offset: number = 0): Promise<ApiResult<unknown[]>> => {
		try {
			const response = await apiClient.get(`/saving/earnings?limit=${limit}&offset=${offset}`)
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.saving.earningsLoadFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},
}
