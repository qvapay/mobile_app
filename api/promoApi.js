import { apiClient } from './client'

export const promoApi = {
	getPromo: async () => {
		try {
			const response = await apiClient.get('/promo', { silent: true })
			return { success: true, data: response.data?.data || response.data }
		} catch (error) { return { success: false, error: error.message || 'No se pudo obtener la promoción', data: null } }
	},
}

export default promoApi