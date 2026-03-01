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
}

export default savingApi
