import { apiClient } from './client'

// Store API functions (gift cards, recargas, etc.)
export const storeApi = {

	/**
	 * List all store products (tarjetas de regalo, productos digitales, etc.)
	 * @param {Object} filters - Filtros opcionales, se enviarán como query string (ej: { country: 'CU', category: 'giftcard' })
	 * @returns {Promise<Object>} Store items response
	 */
	index: async (filters = {}) => {

		try {

			const params = new URLSearchParams()
			Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null) { params.append(key, String(value)) } })

			const query = params.toString()
			const url = query ? `/store?${query}` : '/store'
			const response = await apiClient.get(url)

			return { success: true, data: response.data, status: response.status }

		} catch (error) {

			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.error || errorData.message || 'No se pudieron obtener los productos de la tienda',
					details: errorData,
					status: error.response.status,
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

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
}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default storeApi

