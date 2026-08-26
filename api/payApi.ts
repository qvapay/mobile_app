import { apiClient } from './client'
import type { ApiClientError, ApiResult } from '../types/api'
import type { Transaction } from '../types/domain'

export const payApi = {

	/**
	 * Pays a pending invoice/transaction created by a merchant or another user
	 * (`POST /transaction/{uuid}/pay`, requires auth). Debits the payer's
	 * balance and settles the transaction; typically reached via the Pay
	 * screen from a `qvapay.com/pay/{uuid}` deep link or QR scan.
	 *
	 * @param uuid - Transaction UUID
	 * @param comment - Optional reaction/mood ('loved' | 'happy' | 'sad' | 'thumbsy' | '')
	 * @returns `{ success, data?, error?, status? }` — `data` is the paid transaction
	 *
	 * Example request body: { "comment": "loved" }
	 */
	payTransaction: async (uuid: string, comment: string = ''): Promise<ApiResult<Transaction>> => {
		try {
			const response = await apiClient.post(`/transaction/${uuid}/pay`, { comment })
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (err) {
			const error = err as ApiClientError
			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}
	},
}
