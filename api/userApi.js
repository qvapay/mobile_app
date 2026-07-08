import { apiClient } from './client'

export const userApi = {

	/**
	 * Heartbeat (`POST /user/heartbeat`): marks the current user as online and
	 * fetches the online status of tracked users (P2P peers/chats). Sent with
	 * `silent: true` so the periodic ping never flashes the global loading bar.
	 *
	 * @param {string[]} trackedUserIds - Array of user UUIDs to check (max 100)
	 * @returns {Promise<Object>} `{ success, data?, error? }` — `data.statuses` maps uuid → online boolean
	 */
	heartbeat: async (trackedUserIds = []) => {
		try {
			const body = trackedUserIds.length > 0 ? { trackedUserIds } : {}
			const response = await apiClient.post('/user/heartbeat', body, { silent: true })
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.message } }
	},

	/**
	 * Searches for a user by uuid, username, email or verified phone number
	 * (`POST /user/search`). Used to resolve transfer recipients.
	 *
	 * @param {string} search - The uuid, username, email or verified phone number to look up
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the matched public profile
	 */
	searchUser: async (search) => {
		try {
			const response = await apiClient.post(`/user/search`, { query: search })
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Requests a KYC verification session from the DIDIT provider (`POST /user/kyc`).
	 * Unwraps `response.data.data`, so `data` is the hosted verification URL to open.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the verification URL string
	 */
	requestKYCSession: async () => {
		try {
			const response = await apiClient.post(`/user/kyc`)
			return { success: true, data: response.data?.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo obtener la sesión de verificación', status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets the current user's KYC status (`GET /user/kyc`).
	 * `result` is one of: started, processing, passed, failed.
	 *
	 * @returns {Promise<Object>} `{ success, data?, raw?, error?, status? }` — `data` is `{ uuid, KYC: { result, country, birthday, document_url, selfie_url } }`, `raw` the unwrapped response body
	 */
	getKYCStatus: async () => {
		try {
			const response = await apiClient.get(`/user/kyc`)
			return { success: true, data: response.data?.data, raw: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status, details: error.response?.data } }
	},

	/**
	 * Gets the current user's extended profile (`GET /user/extended`) —
	 * the full account payload used across Home and Settings.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the extended profile
	 */
	getUserProfile: async () => {
		try {
			const response = await apiClient.get(`/user/extended`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Updates the current user's profile fields (`POST /user/update`).
	 *
	 * @param {Object} userData - Partial profile fields to update (name, bio, username, ...)
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the updated profile
	 */
	updateUser: async (userData) => {
		try {
			const response = await apiClient.post(`/user/update`, userData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Starts or completes phone verification (`POST /user/verify/phone`).
	 * Two-step flow: first call sends the code (delivered via Telegram, not SMS),
	 * second call passes `code` + `verify` to confirm it.
	 *
	 * @param {Object} phoneData - The phone verification data
	 * @param {string} phoneData.phone - The phone number
	 * @param {string} phoneData.country - The country code
	 * @param {string} [phoneData.code] - The verification code (verification step only)
	 * @param {boolean} [phoneData.verify] - Whether this is the verification step
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	verifyPhone: async (phoneData) => {
		try {
			const response = await apiClient.post(`/user/verify/phone`, phoneData)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Removes the verified phone number from the account.
	 * Gotcha: removal is `PUT /user/verify/phone` (same path as verification,
	 * different method) — there is no DELETE route.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	removePhone: async () => {
		try {
			const response = await apiClient.put(`/user/verify/phone`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Gets a one-time deep link to the QvaPay Telegram bot that binds the
	 * user's Telegram account (`GET /user/verify/telegram`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` contains the verification link
	 */
	getTelegramVerificationLink: async () => {
		try {
			const response = await apiClient.get(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Unlinks the Telegram account (`PUT /user/verify/telegram` — PUT means
	 * "remove" here, mirroring `removePhone`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	removeTelegram: async () => {
		try {
			const response = await apiClient.put(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Changes the account password (`PUT /user/update/password`).
	 * Requires the current password. Existing sessions stay valid.
	 *
	 * @param {Object} passwordData - The password data
	 * @param {string} passwordData.old_password - The current password
	 * @param {string} passwordData.new_password - The new password (min 8 chars)
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	changePassword: async (passwordData) => {
		try {
			const response = await apiClient.put(`/user/update/password`, passwordData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Gets referral data — invited users list and earnings (`GET /user/referrals`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	getReferrals: async () => {
		try {
			const response = await apiClient.get(`/user/referrals`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Tracks a referral-share attempt for analytics (`POST /user/referrals/share`).
	 * Fire-and-forget: failures resolve to `{ success: false }` with no error detail.
	 *
	 * @param {string} channel - The share channel (sms, telegram, x, facebook, link)
	 * @returns {Promise<Object>} `{ success, data? }`
	 */
	trackShareAttempt: async (channel) => {
		try {
			const response = await apiClient.post(`/user/referrals/share`, { channel })
			return { success: true, data: response.data }
		} catch (error) { return { success: false } }
	},

	/**
	 * Gets the Gold Check subscription status (`GET /user/gold`).
	 * Unwraps `response.data.user`, so `data` is the user object with
	 * `golden_check` / expiration fields.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	getGoldCheckStatus: async () => {
		try {
			const response = await apiClient.get(`/user/gold`)
			return { success: true, data: response.data.user, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Purchases a Gold Check with QvaPay balance (`POST /user/gold`).
	 * Can gift it to another user via `uuid`. For App Store / Play purchases
	 * see `validateGoldReceipt` instead.
	 *
	 * @param {Object} purchaseData - The purchase data
	 * @param {string} purchaseData.uuid - The target user's UUID
	 * @param {string} purchaseData.duration - The subscription duration
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	purchaseGold: async (purchaseData) => {
		try {
			const response = await apiClient.post(`/user/gold`, purchaseData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Gets the user's saved payment methods for P2P offers (`GET /user/payment-methods`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the list of payment methods
	 */
	getPaymentMethods: async () => {
		try {
			const response = await apiClient.get(`/user/payment-methods`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudieron obtener los métodos de pago', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Creates a new payment method (`POST /user/payment-methods`).
	 * `success` is only true on a 200/201 response.
	 *
	 * @param {{ coin: string, details: Object }} payload - Coin tick plus the coin-specific form fields
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the created payment method
	 */
	createPaymentMethod: async (payload) => {
		try {
			const response = await apiClient.post(`/user/payment-methods`, payload)
			return { success: response.status === 201 || response.status === 200, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo crear el método de pago', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Deletes a payment method (`DELETE /user/payment-methods` with `{ id }` in the request body).
	 *
	 * @param {string|number} id - The payment method identifier
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	deletePaymentMethod: async (id) => {
		try {
			const response = await apiClient.delete(`/user/payment-methods`, { data: { id } })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo eliminar el método de pago', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets the user's saved QvaPay contacts (`GET /user/contact`).
	 * Unwraps `response.data.contacts`; `data` is always an array (empty on odd payloads).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the contacts array
	 */
	getContacts: async () => {
		try {
			const response = await apiClient.get(`/user/contact`)
			return { success: true, data: response.data?.contacts ?? [], status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudieron obtener los contactos', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Adds another QvaPay user as a contact (`POST /user/contact`).
	 *
	 * @param {string} contact_uuid - The UUID of the user to add as contact
	 * @param {string} name - The display name for the contact
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the created contact
	 */
	addContact: async (contact_uuid, name) => {
		try {
			const response = await apiClient.post(`/user/contact`, { contact_uuid, name })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo agregar el contacto', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Toggles the favorite flag on a contact (`PATCH /user/contact`).
	 *
	 * @param {number} contact_id - The contact ID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data.favorite` is the new boolean state
	 */
	toggleFavoriteContact: async (contact_id) => {
		try {
			const response = await apiClient.patch(`/user/contact`, { contact_id })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo actualizar el favorito', status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Deletes a contact (`DELETE /user/contact` with `{ contact_id }` in the request body).
	 *
	 * @param {string|number} contactId - The contact ID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	deleteContact: async (contactId) => {
		try {
			const response = await apiClient.delete(`/user/contact`, { data: { contact_id: contactId } })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo eliminar el contacto', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Matches device contacts against QvaPay users (`POST /user/contacts/sync`).
	 * Only sends phone numbers the user consented to share (see ContactsDisclosureModal).
	 *
	 * @param {string[]} phoneNumbers - Array of normalized phone numbers
	 * @returns {Promise<Object>} `{ success, data?, error? }` — `data.matches` is `[{ phone, user }]`
	 */
	syncContacts: async (phoneNumbers) => {
		try {
			const response = await apiClient.post('/user/contacts/sync', { phones: phoneNumbers })
			return { success: true, data: response.data }
		} catch (error) {
			if (error.response?.data) {
				return { success: false, error: error.response.data.error || 'No se pudieron sincronizar los contactos' }
			}
			return { success: false, error: error.message || 'Error de red' }
		}
	},

	/**
	 * Generates a new TOTP secret for 2FA enrollment (`POST /auth/create-2fa`
	 * with an empty body, requires auth). Nothing is persisted yet — the secret
	 * only sticks after `activate2FA` verifies a code against it.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` holds `secret` and `otpauth_url` (for the QR code)
	 */
	generate2FA: async () => {
		try {
			const response = await apiClient.post('/auth/create-2fa', {})
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo generar el código 2FA', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Activates 2FA (`POST /auth/create-2fa` with `code` + `secret`).
	 * The backend verifies the TOTP code against the secret from `generate2FA`
	 * and saves it; from then on login requires a 6-digit TOTP instead of the email PIN.
	 *
	 * @param {Object} data - The 2FA activation data
	 * @param {string} data.code - The 6-digit TOTP code from the authenticator app
	 * @param {string} data.secret - The secret returned by `generate2FA`
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	activate2FA: async ({ code, secret }) => {
		try {
			const response = await apiClient.post('/auth/create-2fa', { code, secret })
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo activar el 2FA', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Deactivates TOTP 2FA for the current user (`POST /auth/reset-2fa`, requires auth).
	 * Login falls back to the emailed 4-digit PIN afterwards.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }`
	 */
	deactivate2FA: async () => {
		try {
			const response = await apiClient.post('/auth/reset-2fa', {})
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo desactivar el 2FA', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},


	/**
	 * Validates an in-app-purchase receipt for the Gold Check subscription
	 * (`POST /user/gold/validate-receipt`). The backend verifies the receipt
	 * with Apple/Google and activates Gold server-side — the source of truth
	 * is the returned `golden_expire`, never the local IAP state.
	 *
	 * @param {Object} receiptData - The receipt data
	 * @param {string} receiptData.receipt - The purchase receipt/token
	 * @param {string} receiptData.platform - 'ios' or 'android'
	 * @param {string} receiptData.productId - The product ID
	 * @param {string} receiptData.transactionId - The transaction ID
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` includes `golden_expire`
	 */
	validateGoldReceipt: async (receiptData) => {
		try {
			const response = await apiClient.post(`/user/gold/validate-receipt`, receiptData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo validar la compra', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Uploads the user's avatar or cover photo (`POST /user/avatar`,
	 * multipart/form-data with `file` + `type` fields).
	 *
	 * @param {Object} params
	 * @param {{ uri: string, name?: string, type?: string }} params.file - The local image file
	 * @param {'avatar'|'cover'} [params.uploadType='avatar'] - Which image slot to replace
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` includes the new `url` and `path`
	 */
	uploadAvatar: async ({ file, uploadType = 'avatar' }) => {
		try {
			const formData = new FormData()
			formData.append('file', {
				uri: file.uri,
				name: file.name || 'avatar.jpg',
				type: file.type || 'image/jpeg'
			})
			formData.append('type', uploadType)
			const config = { headers: { 'Content-Type': 'multipart/form-data' } }
			const response = await apiClient.post('/user/avatar', formData, config)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo subir la imagen', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets server-side notification preferences (`GET /user/notifications`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` maps notification channels to booleans
	 */
	getNotificationSettings: async () => {
		try {
			const response = await apiClient.get('/user/notifications')
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Updates server-side notification preferences (`POST /user/notifications`).
	 *
	 * @param {Object} settings - The notification settings to update
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is the saved settings
	 */
	updateNotificationSettings: async (settings) => {
		try {
			const response = await apiClient.post('/user/notifications', settings)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

}