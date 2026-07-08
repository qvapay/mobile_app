import { apiClient } from './client'

export const savingApi = {
	/**
	 * Gets the savings account summary (`GET /saving`).
	 * Unwraps `response.data.data` when the payload is nested.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` holds balance, totals (deposited/withdrawn/earned), rate and Roundup state
	 */
	getSummary: async () => {
		try {
			const response = await apiClient.get('/saving')
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo obtener el resumen de ahorros', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Toggles automatic Roundup (`POST /saving/roundup`) — when enabled,
	 * payments are rounded up and the spare change lands in savings.
	 *
	 * @param {boolean} enabled - Whether roundup is active
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	updateRoundup: async (enabled) => {
		try {
			const response = await apiClient.post('/saving/roundup', { enabled })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo actualizar el ajuste de redondeo', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Moves funds from the main balance into savings (`POST /saving/deposit`).
	 *
	 * @param {number} amount - Amount to deposit
	 * @param {string} [description] - Optional description
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	deposit: async (amount, description = '') => {
		try {
			const response = await apiClient.post('/saving/deposit', { amount, description })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo realizar el depósito', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Moves funds from savings back to the main balance (`POST /saving/withdraw`).
	 *
	 * @param {number} amount - Amount to withdraw
	 * @param {string} [description] - Optional description
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	withdraw: async (amount, description = '') => {
		try {
			const response = await apiClient.post('/saving/withdraw', { amount, description })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo realizar el retiro', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets the savings movement history — deposits, withdrawals, roundups,
	 * earnings (`GET /saving/transactions`).
	 *
	 * @param {number} [limit=50] - Max results
	 * @param {number} [offset=0] - Offset for pagination
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the transactions list
	 */
	getTransactions: async (limit = 50, offset = 0) => {
		try {
			const response = await apiClient.get(`/saving/transactions?limit=${limit}&offset=${offset}`)
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudieron obtener las transacciones', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets the interest earnings history, credited by the savings-earnings
	 * cron (`GET /saving/earnings`).
	 *
	 * @param {number} [limit=12] - Max results
	 * @param {number} [offset=0] - Offset for pagination
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the earnings list
	 */
	getEarnings: async (limit = 12, offset = 0) => {
		try {
			const response = await apiClient.get(`/saving/earnings?limit=${limit}&offset=${offset}`)
			return { success: true, data: response.data?.data || response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudieron obtener las ganancias', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},
}
