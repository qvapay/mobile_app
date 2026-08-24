import { apiClient } from './client'
import i18n from '../i18n'

export const promoApi = {
	/**
	 * Fetches the active promo banner shown across the app (`GET /promo`).
	 * Sent with `silent: true` so it never triggers the global loading bar,
	 * and it never rejects — failures resolve to `{ success: false, data: null }`
	 * so screens can simply hide the banner.
	 *
	 * @returns {Promise<Object>} `{ success, data, error? }` — `data` is the promo payload (unwrapped from `data.data` when nested) or null
	 */
	getPromo: async () => {
		try {
			const response = await apiClient.get('/promo', { silent: true })
			return { success: true, data: response.data?.data || response.data }
		} catch (error) { return { success: false, error: error.message || i18n.t('api.promo.promoLoadFailed'), data: null } }
	},
}