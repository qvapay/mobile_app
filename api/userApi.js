import { apiClient } from './client'

export const userApi = {

	/**
	 * Search for a user based on its uuid, username, email or verified phone number
	 * @param {string} search - The uuid, username, email or verified phone number of the user to search for
	 * @returns {Promise<Object>} The user data
	 */
	searchUser: async (search) => {
		try {
			const response = await apiClient.post(`/user/search`, { query: search })
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return {
				success: false,
				error: error.message,
				status: error.response?.status
			}
		}
	},

	/**
	 * Submit KYC information (country, birthday, confirmed)
	 * @param {{ country: string, birthday: string, confirmed: boolean }} payload
	 */
	submitKYCInfo: async ({ country, birthday, confirmed }) => {

		try {

			const formData = new FormData()
			formData.append('country', country)
			formData.append('birthday', birthday)
			formData.append('confirmed', confirmed ? 'true' : 'false')

			const config = { headers: { 'Content-Type': 'multipart/form-data' } }
			const response = await apiClient.post(`/user/kyc2/info`, formData, config)
			return { success: response.status === 200, data: response.data, status: response.status }

		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || (errorData.errors ? errorData.errors[0] : 'No se pudo enviar la información'), details: errorData, status: error.response.status }
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
			const response = await apiClient.get(`/user/kyc2`)
			return { success: true, data: response.data?.data, raw: response.data, status: response.status }
		} catch (error) {
			return { success: false, error: error.message, status: error.response?.status, details: error.response?.data }
		}
	},

	/**
	 * Upload a KYC picture (document | selfie | check)
	 * @param {Object} payload
	 * @param {'document'|'selfie'|'check'} payload.pictureType
	 * @param {{ uri: string, name?: string, type?: string }} payload.file
	 * @returns {Promise<Object>} Upload result
	 */
	uploadKYCPicture: async ({ pictureType, file }) => {

		try {

			const formData = new FormData()
			formData.append('picture_type', pictureType)
			formData.append('image', {
				uri: file.uri,
				name: file.name || `kyc-${pictureType}.jpg`,
				type: file.type || 'image/jpeg'
			})

			// Axios won't set proper headers for multipart unless we override content-type boundary automatically
			const config = { headers: { 'Content-Type': 'multipart/form-data' } }
			const response = await apiClient.post(`/user/kyc2`, formData, config)
			return { success: response.status === 201 || response.status === 200, data: response.data, status: response.status }

		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo subir la imagen', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Get current user profile data
	 * @returns {Promise<Object>} The user profile data
	 */
	getUserProfile: async () => {
		try {
			const response = await apiClient.get(`/user/extended`)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return {
				success: false,
				error: error.message,
				status: error.response?.status
			}
		}
	},

	/**
	 * Update current user data
	 * @param {Object} userData - The user data to update
	 * @returns {Promise<Object>} The updated user data
	 */
	updateUser: async (userData) => {
		try {
			const response = await apiClient.put(`/user/update`, userData)
			return {
				success: true,
				data: response.data,
				status: response.status
			}
		} catch (error) {
			return {
				success: false,
				error: error.message,
				status: error.response?.status
			}
		}
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
			return {
				success: false,
				error: error.message,
				status: error.response?.status
			}
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
	deletePaymentMethod: async (idOrUuid) => {
		try {
			const response = await apiClient.delete(`/user/payment-methods/${idOrUuid}`)
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
	 * Delete a contact by id/uuid
	 * @param {string|number} idOrUuid - The contact identifier
	 * @returns {Promise<Object>} The deletion result
	 */
	deleteContact: async (idOrUuid) => {
		try {
			const response = await apiClient.delete(`/user/contact/${idOrUuid}`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo eliminar el contacto', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	}
}