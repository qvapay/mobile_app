import { apiClient } from './client'

// P2P API functions
export const p2pApi = {
	/**
	 * Get P2P offers with optional filters
	 * @param {Object} filters - Optional filters for P2P offers
	 * @param {number} filters.page - Page number (default: 1)
	 * @param {string} filters.order - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @param {number} filters.take - Number of items per page (default: 50)
	 * @param {string} filters.type - Offer type: 'buy' or 'sell'
	 * @param {number} filters.min - Minimum amount filter (default: 0)
	 * @param {number} filters.max - Maximum amount filter (default: 1000000)
	 * @param {number} filters.ratio_min - Minimum ratio filter (default: 0)
	 * @param {number} filters.ratio_max - Maximum ratio filter (default: 0)
	 * @param {string} filters.coin - Coin ticker to filter by (e.g., 'ETECSA', 'BANK_CUP', 'CLASICA')
	 * @returns {Promise<Object>} P2P offers response with pagination
	 */
	index: async (filters = {}) => {

		try {
			// Build query parameters
			const params = new URLSearchParams()

			// Add pagination parameters
			if (filters.page) params.append('page', filters.page.toString())
			if (filters.order) params.append('order', filters.order)
			if (filters.take) params.append('take', filters.take.toString())

			// Add filter parameters
			if (filters.type) params.append('type', filters.type)
			if (filters.my) params.append('my', 'true')
			if (filters.only_kyc) params.append('only_kyc', '1')
			if (filters.only_vip) params.append('only_vip', '1')
			if (filters.min !== undefined)
				params.append('min', filters.min.toString())
			if (filters.max !== undefined)
				params.append('max', filters.max.toString())
			if (filters.ratio_min !== undefined)
				params.append('ratio_min', filters.ratio_min.toString())
			if (filters.ratio_max !== undefined)
				params.append('ratio_max', filters.ratio_max.toString())
			if (filters.coin) params.append('coin', filters.coin)
			if (filters.orderBy) params.append('orderBy', filters.orderBy)

			// Make the API request
			const response = await apiClient.get(`/p2p/index?${params.toString()}`)

			return {
				success: true,
				data: response.data,
				current_page: response.data.current_page,
				per_page: response.data.per_page,
				total: response.data.total,
				offers: response.data.data
			}

		} catch (error) {

			// Handle specific API errors
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error: errorData.message || 'No se pudieron obtener las ofertas P2P',
					details: errorData,
					status: error.response.status
				}
			}

			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Get P2P offers by type (buy or sell)
	 * @param {string} type - Offer type: 'buy' or 'sell'
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByType: async (type, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type })
	},

	/**
	 * Get P2P offers by coin
	 * @param {string} coin - Coin ticker (e.g., 'ETECSA', 'BANK_CUP', 'CLASICA')
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByCoin: async (coin, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, coin })
	},

	/**
	 * Get P2P offers with amount range filter
	 * @param {number} min - Minimum amount
	 * @param {number} max - Maximum amount
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Filtered P2P offers response
	 */
	getByAmountRange: async (min, max, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, min, max })
	},

	/**
	 * Get buy offers for a specific coin
	 * @param {string} coin - Coin ticker
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Buy offers response
	 */
	getBuyOffers: async (coin, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type: 'buy', coin })
	},

	/**
	 * Get sell offers for a specific coin
	 * @param {string} coin - Coin ticker
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Sell offers response
	 */
	getSellOffers: async (coin, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, type: 'sell', coin })
	},

	/**
	 * Get P2P offers with pagination
	 * @param {number} page - Page number
	 * @param {number} perPage - Items per page
	 * @param {Object} additionalFilters - Additional filters to apply
	 * @returns {Promise<Object>} Paginated P2P offers response
	 */
	getPaginated: async (page = 1, perPage = 50, additionalFilters = {}) => {
		return p2pApi.index({ ...additionalFilters, page, take: perPage })
	},

	show: async (p2p_uuid) => {
		try {
			const response = await apiClient.get(`/p2p/${p2p_uuid}`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			return { success: false, error: error.response?.data || error.message, status: error.response?.status }
		}
	},

	/**
	 * Cancel an existing P2P offer/escrow
	 * @param {string} p2p_uuid - The P2P UUID
	 */
	cancel: async (p2p_uuid) => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/cancel`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			return { success: false, error: error.response?.data || error.message, status: error.response?.status }
		}
	},

	/**
	 * Mark escrow as paid by the payer
	 * @param {string} p2p_uuid - The P2P UUID
	 */
	markPaid: async (p2p_uuid, tx_id = '') => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/paid`, { tx_id })
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},

	/**
	 * Confirm payment received and release escrow
	 * @param {string} p2p_uuid - The P2P UUID
	 */
	confirmReceived: async (p2p_uuid) => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/received`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},

	/**
	 * Get chat messages for a P2P offer
	 * @param {string} p2p_uuid - The P2P UUID
	 */
	getChat: async (p2p_uuid) => {
		try {
			const response = await apiClient.get(`/p2p/${p2p_uuid}/chat`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},

	/**
	 * Send a chat message for a P2P offer
	 * Supports text messages, stickers (`:sticker:name.webm`), and image uploads
	 * @param {string} p2p_uuid - The P2P UUID
	 * @param {{ message?: string, image?: object }} payload - Message payload. image should be { uri, type, fileName }
	 */
	sendChat: async (p2p_uuid, payload) => {
		try {
			if (payload.image) {
				const formData = new FormData()
				formData.append('file', {
					uri: payload.image.uri,
					type: payload.image.type || 'image/jpeg',
					name: payload.image.fileName || 'photo.jpg',
				})
				if (payload.message) {
					formData.append('message', payload.message)
				}
				const response = await apiClient.post(`/p2p/${p2p_uuid}/chat`, formData, {
					headers: { 'Content-Type': 'multipart/form-data' },
				})
				return { success: true, data: response.data, status: response.status }
			}
			const response = await apiClient.post(`/p2p/${p2p_uuid}/chat`, payload)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},

	/**
	 * Create a new P2P offer
	 * @param {Object} data - The P2P offer data
	 * @returns {Promise<Object>} The P2P offer response
	 */
	create: async data => {
		try {
			const response = await apiClient.post('/p2p/create', data)
			if (response.data && response.status === 201) {
				return { success: true, data: response.data, status: response.status }
			} else {
				return {
					success: false,
					error: response.data?.error || 'No se pudo crear la oferta P2P',
					details: response.data,
					status: response.status
				}
			}
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return {
					success: false,
					error:
						errorData.error ||
						errorData.message ||
						'No se pudo crear la oferta P2P',
					details: errorData,
					status: error.response.status
				}
			}

			return {
				success: false,
				error: error.message || 'Ha ocurrido un error de red',
				status: error.response?.status
			}
		}
	},

	/**
	 * Rate a P2P offer
	 * @param {string} p2p_uuid - The P2P UUID
	 * @param {Object} payload - The rating payload
	 * @returns {Promise<Object>} The P2P offer rating response
	 */
	rateOffer: async (p2p_uuid, payload) => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/rate`, payload)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},

	/**
	 * Apply to a P2P offer
	 * @param {string} p2p_uuid - The P2P UUID
	 * @returns {Promise<Object>} The P2P offer apply response
	 */
	apply: async (p2p_uuid) => {
		try {
			const response = await apiClient.post(`/p2p/${p2p_uuid}/apply`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.response?.data || error.message, status: error.response?.status } }
	},
}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default p2pApi
