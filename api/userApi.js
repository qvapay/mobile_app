import { apiClient } from './client'

export const userApi = {

	/**
	 * Heartbeat: marks current user as online + fetches tracked users' online statuses
	 * @param {string[]} trackedUserIds - Array of user UUIDs to check (max 100)
	 * @returns {Promise<Object>} { success, data: { statuses: { uuid: boolean } } }
	 */
	heartbeat: async (trackedUserIds = []) => {
		try {
			const body = trackedUserIds.length > 0 ? { trackedUserIds } : {}
			const response = await apiClient.post('/user/heartbeat', body, { silent: true })
			return { success: true, data: response.data }
		} catch (error) { return { success: false, error: error.message } }
	},

	/**
	 * Search for a user based on its uuid, username, email or verified phone number
	 * @param {string} search - The uuid, username, email or verified phone number of the user to search for
	 * @returns {Promise<Object>} The user data
	 */
	searchUser: async (search) => {
		try {
			const response = await apiClient.post(`/user/search`, { query: search })
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Request a KYC verification session URL from DIDIT provider
	 * @returns {Promise<Object>} { success, data: string (verification URL) }
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
	 * Get KYC status for the current user
	 * @returns {Promise<Object>} KYC data { uuid, KYC: { result, country, birthday, document_url, selfie_url } }
	 */
	getKYCStatus: async () => {
		try {
			const response = await apiClient.get(`/user/kyc`)
			return { success: true, data: response.data?.data, raw: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status, details: error.response?.data } }
	},

	/**
	 * Get current user profile data
	 * @returns {Promise<Object>} The user profile data
	 */
	getUserProfile: async () => {
		try {
			const response = await apiClient.get(`/user/extended`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Update current user data
	 * @param {Object} userData - The user data to update
	 * @returns {Promise<Object>} The updated user data
	 */
	updateUser: async (userData) => {
		try {
			const response = await apiClient.post(`/user/update`, userData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Verify phone number
	 * @param {Object} phoneData - The phone verification data
	 * @param {string} phoneData.phone - The phone number
	 * @param {string} phoneData.country - The country code
	 * @param {string} phoneData.code - The verification code (optional, for verification step)
	 * @param {boolean} phoneData.verify - Whether this is a verification step
	 * @returns {Promise<Object>} The verification result
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
	 * Remove phone number from user account
	 * @returns {Promise<Object>} The removal result
	 */
	removePhone: async () => {
		try {
			const response = await apiClient.put(`/user/verify/phone`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Get Telegram verification link
	 * @returns {Promise<Object>} The verification link
	 */
	getTelegramVerificationLink: async () => {
		try {
			const response = await apiClient.get(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Remove Telegram account from user account
	 * @returns {Promise<Object>} The removal result
	 */
	removeTelegram: async () => {
		try {
			const response = await apiClient.put(`/user/verify/telegram`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Change password
	 * @param {Object} passwordData - The password data
	 * @param {string} passwordData.current_password - The current password
	 * @param {string} passwordData.new_password - The new password
	 * @returns {Promise<Object>} The password change result
	 */
	changePassword: async (passwordData) => {
		try {
			const response = await apiClient.put(`/user/update/password`, passwordData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Get referral data including referrals list and earnings
	 * @returns {Promise<Object>} The referral data
	 */
	getReferrals: async () => {
		try {
			const response = await apiClient.get(`/user/referrals`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Track a share attempt for analytics
	 * @param {string} channel - The share channel (sms, telegram, x, facebook, link)
	 */
	trackShareAttempt: async (channel) => {
		try {
			const response = await apiClient.post(`/user/referrals/share`, { channel })
			return { success: true, data: response.data }
		} catch (error) { return { success: false } }
	},

	/**
	 * Get gold check status
	 * @returns {Promise<Object>} The gold check status
	 */
	getGoldCheckStatus: async () => {
		try {
			const response = await apiClient.get(`/user/gold`)
			return { success: true, data: response.data.user, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Purchase gold check for a user
	 * @param {Object} purchaseData - The purchase data
	 * @param {string} purchaseData.uuid - The target user's UUID
	 * @param {string} purchaseData.duration - The subscription duration
	 * @returns {Promise<Object>} The purchase result
	 */
	purchaseGold: async (purchaseData) => {
		try {
			const response = await apiClient.post(`/user/gold`, purchaseData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Get user's saved payment methods
	 * @returns {Promise<Object>} The list of payment methods
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
	 * Create a new payment method
	 * @param {{ coin: string, details: Object }} payload
	 * @returns {Promise<Object>} The created payment method
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
	 * Delete an existing payment method
	 * @param {string|number} idOrUuid - The identifier of the payment method
	 * @returns {Promise<Object>} The deletion result
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
	 * Get user's saved contacts
	 * @returns {Promise<Object>} The contacts list
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
	 * Add a contact
	 * @param {string} contact_uuid - The UUID of the user to add as contact
	 * @param {string} name - The display name for the contact
	 * @returns {Promise<Object>} The created contact
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
	 * Toggle favorite status for a contact
	 * @param {number} contact_id - The contact ID
	 * @returns {Promise<Object>} { favorite: boolean }
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
	 * Delete a contact by id/uuid
	 * @param {string|number} idOrUuid - The contact identifier
	 * @returns {Promise<Object>} The deletion result
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
	 * Sync device contacts phone numbers with the backend to find matching QvaPay users
	 * @param {string[]} phoneNumbers - Array of normalized phone numbers
	 * @returns {Promise<Object>} The matched contacts { matches: [{ phone, user }] }
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
	 * Generate a new 2FA secret and QR code
	 * @returns {Promise<Object>} The 2FA secret and otpauth_url for QR code
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
	 * Activate 2FA by verifying the code and saving the secret
	 * @param {Object} data - The 2FA activation data
	 * @param {string} data.code - The 6-digit TOTP code from authenticator app
	 * @param {string} data.secret - The secret to save
	 * @returns {Promise<Object>} The activation result
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
	 * Deactivate 2FA for the current user
	 * @returns {Promise<Object>} The deactivation result
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
	 * Validate an IAP receipt for Gold Check subscription
	 * @param {Object} receiptData - The receipt data
	 * @param {string} receiptData.receipt - The purchase receipt/token
	 * @param {string} receiptData.platform - 'ios' or 'android'
	 * @param {string} receiptData.productId - The product ID
	 * @param {string} receiptData.transactionId - The transaction ID
	 * @returns {Promise<Object>} The validation result with golden_expire
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
	 * Upload user avatar or cover photo
	 * @param {{ uri: string, name?: string, type?: string }} file - The image file
	 * @param {'avatar'|'cover'} uploadType - The type of image to upload
	 * @returns {Promise<Object>} Upload result with { url, path }
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
	 * Get notification settings
	 * @returns {Promise<Object>} The notification settings
	 */
	getNotificationSettings: async () => {
		try {
			const response = await apiClient.get('/user/notifications')
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Update notification settings
	 * @param {Object} settings - The notification settings to update
	 * @returns {Promise<Object>} The updated notification settings
	 */
	updateNotificationSettings: async (settings) => {
		try {
			const response = await apiClient.post('/user/notifications', settings)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Update roundup (micro pagos) settings
	 * @param {Object} settings - { enabled, destination: 'savings' | 'donations' | null }
	 * @returns {Promise<Object>}
	 */
	updateRoundupSettings: async (settings) => {
		try {
			const response = await apiClient.post('/user/roundup', settings)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},
}