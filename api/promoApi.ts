import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiFailure, ApiSuccess } from '../types/api'

/**
 * Resultado de `promoApi.getPromo`: nunca rechaza — el fallo resuelve con
 * `data: null` explícito para que las pantallas simplemente oculten el banner.
 */
export type PromoResult = ApiSuccess<unknown> | (ApiFailure & { data: null })

export const promoApi = {
	/**
	 * Fetches the active promo banner shown across the app (`GET /promo`).
	 * Sent with `silent: true` so it never triggers the global loading bar,
	 * and it never rejects — failures resolve to `{ success: false, data: null }`
	 * so screens can simply hide the banner.
	 *
	 * @returns `{ success, data, error? }` — `data` is the promo payload (unwrapped from `data.data` when nested) or null
	 */
	getPromo: async (): Promise<PromoResult> => {
		try {
			const response = await apiClient.get('/promo', { silent: true })
			return { success: true, data: response.data?.data || response.data }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message || i18n.t('api.promo.promoLoadFailed'), data: null }
		}
	},
}
