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
	 * With `source: 'satoshis'` (BTCLN only) the withdrawal redeems the user's
	 * cashback sats: `amountSats` replaces `amount` and the backend debits
	 * `User.satoshis` instead of the USD balance (fee 0).
	 * `pin` travels as a string so TOTP codes with leading zeros stay intact
	 * (the backend does `String(pin)` anyway).
	 *
	 * @param {Object} params
	 * @param {number|string} [params.amount] - Amount in USD (ignored with source 'satoshis')
	 * @param {string} params.coin - Coin ticker (e.g., "BANK", "BTCLN", etc.)
	 * @param {Object} params.details - Withdrawal details object (form fields)
	 * @param {number|string} params.pin - User's 4-digit PIN or 6-digit OTP
	 * @param {string} [params.payMethod] - Payment method (defaults to coin ticker)
	 * @param {string} [params.note] - Optional personal note for the withdrawal
	 * @param {'balance'|'satoshis'} [params.source] - Funds origin (default balance)
	 * @param {number} [params.amountSats] - Sats to redeem when source is 'satoshis'
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the created withdrawal + transaction
	 */
	withdraw: async ({ amount, coin, details, pin, payMethod, note, source, amountSats }) => {

		try {

			const payload = {
				pay_method: payMethod || coin,
				details: details || {},
				pin: String(pin),
				...(source === 'satoshis'
					? { source: 'satoshis', amount_sats: Number(amountSats) }
					: { amount: Number(amount) }),
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

	/**
	 * Decodes a Lightning destination (`POST /lightning/decode`, silent) so the
	 * UI can show the authoritative amount, description and expiry of a BOLT11
	 * invoice — or the min/max range of a Lightning Address — before submitting.
	 * Purely informational: failures should never block the flow.
	 *
	 * @param {string} invoice - BOLT11 / Lightning Address / LNURL-pay target
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ kind, amount_sat?, description?, expires_at?, min_sat?, max_sat? }`
	 */
	decodeLightning: async (invoice) => {
		try {
			const response = await apiClient.post('/lightning/decode', { invoice }, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				return { success: false, error: error.response.data.error || 'Destino Lightning inválido', status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},
}
