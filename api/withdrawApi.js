import { apiClient } from './client'

export const withdrawApi = {

	/**
	 * Pre-withdraw: Request a temporary PIN via email (without PIN)
	 * @param {number|string} amount - Amount to withdraw
	 * @param {string} coin - Coin ticker (e.g., "BANK", "BTC", etc.)
	 * @param {Object} details - Withdrawal details object (form fields)
	 * @param {string} [payMethod] - Payment method (defaults to coin ticker if not provided)
	 * @param {string} [note] - Optional personal note for the withdrawal
	 * @returns {Promise<Object>} Pre-withdraw response
	 * 
	 * Example:
	 * {
	 *   "pay_method": "BANK",
	 *   "amount": 200,
	 *   "details": {
	 *     "Direccion": "1801 Main St. Kansas City",
	 *     "Nro de Cuenta": "214768027149",
	 *     ...
	 *   },
	 *   "note": "Notas personales"
	 * }
	 */
	preWithdraw: async (amount, coin, details, payMethod, note) => {

		try {

			const payload = {
				pay_method: payMethod || coin,
				amount: Number(amount),
				details: details || {}
			}

			// Add note if provided
			if (note) { payload.note = note }
			const response = await apiClient.post('/withdraw', payload)
			return { success: true, data: response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo procesar la solicitud de extracción',
					details: errorData,
					status: error.response.status
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Withdraw: Complete withdrawal with PIN
	 * @param {number|string} amount - Amount to withdraw
	 * @param {string} coin - Coin ticker (e.g., "BANK", "BTC", etc.)
	 * @param {Object} details - Withdrawal details object (form fields)
	 * @param {number|string} pin - User's PIN received via email
	 * @param {string} [payMethod] - Payment method (defaults to coin ticker if not provided)
	 * @param {string} [note] - Optional personal note for the withdrawal
	 * @returns {Promise<Object>} Withdraw response
	 * 
	 * Example:
	 * {
	 *   "pay_method": "BANK",
	 *   "amount": 200,
	 *   "details": {
	 *     "Direccion": "1801 Main St. Kansas City",
	 *     "Nro de Cuenta": "214768027149",
	 *     ...
	 *   },
	 *   "pin": 1134,
	 *   "note": "Notas personales"
	 * }
	 */
	withdraw: async (amount, coin, details, pin, payMethod, note) => {

		try {

			const payload = {
				pay_method: payMethod || coin,
				amount: Number(amount),
				details: details || {},
				pin: Number(pin)
			}

			// Add note if provided
			if (note) { payload.note = note }
			const response = await apiClient.post('/withdraw', payload)
			return { success: true, data: response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo completar la extracción',
					details: errorData,
					status: error.response.status
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},
}

// Export default for convenience
export default withdrawApi

