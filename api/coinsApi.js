import { apiClient } from './client'

// Coins API functions
export const coinsApi = {
    /**
     * Get coins with optional filters
     * @param {Object} filters - Optional filters (e.g., { enabled_p2p: true })
     * @returns {Promise<Object>} Coins response
     */
    index: async (filters = {}) => {

        try {

            const params = new URLSearchParams()
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, String(value))
                }
            })
            const query = params.toString()
            const url = query ? `/coins/v2?${query}` : '/coins/v2'
            const response = await apiClient.get(url)

            return { success: true, data: response.data, status: response.status }

        } catch (error) {

            if (error.response?.data) {
                const errorData = error.response.data
                return { success: false, error: errorData.error || errorData.message || 'No se pudieron obtener las monedas', details: errorData, status: error.response.status }
            }

            return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
        }
    },
}

// Export the apiClient for other API calls
export { apiClient }

// Export default for convenience
export default coinsApi