import { apiClient } from './client'

export const transferApi = {

	/**
	 * Lists the authenticated user's latest transactions (`GET /transaction`).
	 * Filters are serialized to the query string; empty/null values are skipped.
	 *
	 * @param {Object} [filters] - Optional query filters
	 * @param {string} [filters.user_id] - Only transactions with this counterpart
	 * @param {string} [filters.type] - Transaction type filter
	 * @param {string} [filters.status] - Status filter (paid, pending, processing, received, cancelled)
	 * @param {string} [filters.start_date] - Range start
	 * @param {string} [filters.end_date] - Range end
	 * @param {string|number} [filters.page] - Page number
	 * @param {string|number} [filters.take] - Items per page
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the paginated transactions payload
	 */
	getLatestTransactions: async (filters) => {

		try {

			// Build query string
			const queryString = filters
				? '?' + Object.entries(filters)
					.flatMap(([k, v]) => (v !== undefined && v !== null && v !== '') ? [encodeURIComponent(k) + '=' + encodeURIComponent(v)] : [])
					.join('&')
				: ''

			// Get latest transactions
			const response = await apiClient.get(`/transaction${queryString}`)

			// Return success response with data
			return {
				success: true,
				data: response.data,
				status: response.status
			}

		} catch (error) {

			// Return error response
			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}
	},

	/**
	 * Gets the users the account most recently sent money to
	 * (`GET /transaction/latestusers`) — powers the quick-send avatar row.
	 *
	 * @param {number} [take=10] - Maximum number of recent recipients to return
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the recent recipients list
	 */
	getLatestSentTransfers: async (take = 10) => {
		try {
			const response = await apiClient.get(`/transaction/latestusers?take=${take}`)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}

	},

	/**
	 * Transfers balance to another user (`POST /transaction/transfer`).
	 * Requires the account PIN; `amount` and `pin` are stringified before
	 * sending. Sticker attachments travel inside the description as
	 * `:sticker:<name>.webm`.
	 *
	 * @param {Object} data
	 * @param {string|number} data.amount - Amount to transfer (e.g., "0.2")
	 * @param {string} data.description - Description of the transfer
	 * @param {string} data.to - Recipient's email, username, uuid or verified phone
	 * @param {string|number} data.pin - User's PIN for authorization
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the created transaction
	 *
	 * Example request body:
	 * {
	 *   "amount": "0.2",
	 *   "description": "July salary",
	 *   "to": "ceo@qvapay.com",
	 *   "pin": "1111"
	 * }
	 */
	transferMoney: async ({ amount, description, to, pin }) => {

		try {
			const response = await apiClient.post('/transaction/transfer', {
				amount: amount.toString(),
				description,
				to,
				pin: pin.toString()
			})

			return {
				success: true,
				data: response.data,
				status: response.status
			}

		} catch (error) {

			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}
	},


	/**
	 * Gets the full detail of a transaction (`GET /transaction/{uuid}`).
	 *
	 * @param {string} uuid - Transaction UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the transaction with owner/paid_by info
	 */
	getTransactionDetails: async (uuid) => {
		try {

			const response = await apiClient.get(`/transaction/${uuid}`)

			return {
				success: true,
				data: response.data,
				status: response.status
			}

		} catch (error) {

			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}
	},


	/**
	 * Gets the printable receipt for a transaction (`GET /transaction/{uuid}/pdf`).
	 *
	 * @param {string} uuid - Transaction UUID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the PDF payload for sharing/exporting
	 */
	getTransactionPDF: async (uuid) => {
		try {
			const response = await apiClient.get(`/transaction/${uuid}/pdf`)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return {
				success: false,
				error: error.response?.data?.error || error.response?.data?.message || error.message,
				status: error.response?.status
			}
		}
	},

}