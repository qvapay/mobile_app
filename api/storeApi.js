import { apiClient } from './client'

// Store API functions (gift cards, recargas, etc.)
export const storeApi = {

	/**
	 * List phone packages (recargas telefónicas)
	 * @param {Object} filters - Filtros opcionales (ej: { country: 'CU', operator: 'ETECSA' })
	 * @returns {Promise<Object>} Phone packages response
	 */
	phonePackages: async (filters = {}) => {

		try {

			const params = new URLSearchParams()
			Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null) { params.append(key, String(value)) } })

			const query = params.toString()
			const url = query ? `/store/phone_package?${query}` : '/store/phone_package'
			const response = await apiClient.get(url)

			return { success: true, data: response.data.phone_packages || [], status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudieron obtener las recargas telefónicas',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Purchase a phone package (recarga telefónica)
	 * @param {Object} purchaseData - Datos de compra { phone_package_id, phone_number }
	 * @returns {Promise<Object>} Purchase response
	 */
	purchasePhonePackage: async (purchaseData) => {

		try {

			const { phone_package_id, phone_number } = purchaseData
			if (!phone_package_id || !phone_number) { return { success: false, error: 'phone_package_id y phone_number son requeridos', status: 400 } }

			const response = await apiClient.post('/store/phone_package', {
				phone_package_id,
				phone_number,
			})

			return {
				success: true,
				data: response.data,
				status: response.status,
			}

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo realizar la compra de la recarga',
					details: errorData,
					status: error.response.status,
				}
			}

			return {
				success: false,
				error: error.message || 'Ha ocurrido un error de red',
				status: error.response?.status,
			}
		}
	},

	/**
	 * List gift cards
	 * @param {Object} params - Parámetros opcionales { featured, take }
	 * @returns {Promise<Object>} Gift cards response
	 */
	getGiftCards: async (params = {}) => {

		try {

			const queryParams = new URLSearchParams()
			Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null) { queryParams.append(key, String(value)) } })

			const query = queryParams.toString()
			const url = query ? `/store/gift-card?${query}` : '/store/gift-card'
			const response = await apiClient.get(url)

			return { success: true, data: response.data.data || response.data || [], status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudieron obtener las tarjetas de regalo',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Get gift card detail
	 * @param {string} uuid - UUID de la tarjeta de regalo
	 * @returns {Promise<Object>} Gift card detail response
	 */
	getGiftCardDetail: async (uuid) => {

		try {

			const response = await apiClient.get(`/store/gift-card/${uuid}`)

			return { success: true, data: response.data.data || response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo obtener el detalle de la tarjeta de regalo',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * List user's purchases (Mis Compras)
	 * @returns {Promise<Object>} Purchases response
	 */
	getMyPurchases: async () => {

		try {

			const response = await apiClient.get('/store/my')

			return { success: true, data: response.data.data || [], status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudieron obtener tus compras',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Get purchase detail
	 * @param {number|string} id - ID de la compra
	 * @returns {Promise<Object>} Purchase detail response
	 */
	getPurchaseDetail: async (id) => {

		try {

			const response = await apiClient.get(`/store/my/${id}`)

			return { success: true, data: response.data.data || response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo obtener el detalle de la compra',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Purchase a gift card
	 * @param {string} uuid - UUID de la tarjeta de regalo
	 * @param {Object} purchaseData - { code, amount (para RANGE) }
	 * @returns {Promise<Object>} Purchase response
	 */
	purchaseGiftCard: async (uuid, purchaseData) => {

		try {

			if (!uuid) { return { success: false, error: 'UUID de tarjeta es requerido', status: 400 } }
			if (!purchaseData?.code) { return { success: false, error: 'Código de opción es requerido', status: 400 } }

			const response = await apiClient.post(`/store/gift-card/${uuid}`, purchaseData)

			return { success: true, data: response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudo realizar la compra de la tarjeta de regalo',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default storeApi

