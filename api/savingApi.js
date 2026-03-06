import { apiClient } from './client'

export const savingApi = {
	/**
	 * Get savings account summary
	 * @returns {Promise<Object>} Savings summary with balance, totals, rate, etc.
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
	 * Deposit funds into savings account
	 * @param {number} amount - Amount to deposit
	 * @param {string} description - Optional description
	 * @returns {Promise<Object>} Deposit result
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
	 * Withdraw funds from savings account
	 * @param {number} amount - Amount to withdraw
	 * @param {string} description - Optional description
	 * @returns {Promise<Object>} Withdrawal result
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
	 * Get savings transactions history
	 * @param {number} limit - Max results (default 50)
	 * @param {number} offset - Offset for pagination (default 0)
	 * @returns {Promise<Object>} Transactions list
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
	 * Get savings earnings history
	 * @param {number} limit - Max results (default 12)
	 * @param {number} offset - Offset for pagination (default 0)
	 * @returns {Promise<Object>} Earnings list
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

export default savingApi
