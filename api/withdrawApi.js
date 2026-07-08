import { apiClient } from './client'

export const withdrawApi = {

	/**
	 * Emails the user a fresh 4-digit PIN to authorize a withdrawal
	 * (`POST /user/reset-pin`, requires auth). Step 1 of the two-step
	 * withdraw flow — the PIN is then passed to `withdraw`.
	 * Side effect: this ROTATES the account PIN (a new one is generated,
	 * persisted and emailed). Users with TOTP 2FA can skip this and use
	 * their 6-digit code instead.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	requestPin: async () => {
		try {
			const response = await apiClient.post('/user/reset-pin')
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo enviar el PIN',
					details: errorData,
					status: error.response.status
				}
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Executes a withdrawal (`POST /withdraw`). Step 2 of the flow: sends
	 * amount, pay_method, the coin-specific `details` form fields and the
	 * verification code. The backend accepts either the 4-digit account PIN
	 * (see `requestPin`) or a 6-digit TOTP code, and enforces coin min/max
	 * limits plus KYC above certain amounts.
	 * Gotcha: `pin` is sent as a `Number()`, so a code with leading zeros
	 * loses digits. Emailed PINs are safe (always 1000–9999), but a 6-digit
	 * TOTP starting with 0 gets mangled and rejected server-side.
	 *
	 * @param {number|string} amount - Amount to withdraw
	 * @param {string} coin - Coin ticker (e.g., "BANK", "BTC", etc.)
	 * @param {Object} details - Withdrawal details object (form fields)
	 * @param {number|string} pin - User's 4-digit PIN or 6-digit OTP
	 * @param {string} [payMethod] - Payment method (defaults to coin ticker if not provided)
	 * @param {string} [note] - Optional personal note for the withdrawal
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the created withdrawal + transaction
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
