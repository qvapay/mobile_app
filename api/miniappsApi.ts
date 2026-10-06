import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { MiniApp, MiniAppAuthorization, MiniAppGrant, MiniAppPayment, MiniAppScope } from '../types/domain'

/** Body de `pay`: factura del comercio de la mini-app + segundo factor + clave estable. */
export type MiniAppPayInput = {
	invoiceUuid: string
	pin: string
	idempotencyKey: string
}

/** Respuesta de `pay`: un replay idempotente trae `duplicate: true` fuera de `data`. */
export type MiniAppPayResult = MiniAppPayment & { duplicate?: boolean }

/**
 * Envuelve una petición en el sobre `{ success, data, error?, details?, status? }`
 * y desenvuelve el `{ data }` con que responden los endpoints de mini-apps.
 *
 * @param request - Thunk con la llamada axios.
 * @param fallbackError - Mensaje localizado si el backend no trae ninguno.
 */
const wrap = async <T>(request: () => Promise<{ data: { data?: T } & Record<string, unknown>, status: number }>, fallbackError: string): Promise<ApiResult<T>> => {
	try {
		const response = await request()
		return { success: true, data: response.data?.data, status: response.status }
	} catch (err) {
		const error = err as ApiClientError
		if (error.response?.data) {
			const errorData = error.response.data
			return {
				success: false,
				error: errorData.error || errorData.message || fallbackError,
				details: errorData,
				status: error.response.status,
			}
		}
		return { success: false, error: error.message || i18n.t('api.common.networkErrorShort'), status: error.response?.status }
	}
}

export const miniappsApi = {

	/**
	 * Directorio de mini-apps publicadas (`GET /miniapps`), destacadas primero.
	 */
	list: (): Promise<ApiResult<MiniApp[]>> =>
		wrap(() => apiClient.get('/miniapps', { silent: true }), i18n.t('miniapps.errors.loadList')),

	/**
	 * Ficha de una mini-app (`GET /miniapps/{slug}`) con el estado del
	 * consentimiento del usuario. El host la relee al abrir: el directorio
	 * cacheado podría traer orígenes o estado viejos.
	 */
	detail: (slug: string): Promise<ApiResult<MiniApp>> =>
		wrap(() => apiClient.get(`/miniapps/${encodeURIComponent(slug)}`), i18n.t('miniapps.errors.loadApp')),

	/**
	 * Concede (o renueva) el consentimiento de identidad y devuelve el payload
	 * firmado para la mini-app (`POST /miniapps/{slug}/authorize`). El token de
	 * sesión NUNCA sale de la app: la mini-app solo recibe `init_data` + `hash`.
	 */
	authorize: (slug: string, scopes: MiniAppScope[]): Promise<ApiResult<MiniAppAuthorization>> =>
		wrap(() => apiClient.post(`/miniapps/${encodeURIComponent(slug)}/authorize`, { scopes }), i18n.t('miniapps.errors.authorize')),

	/**
	 * Paga una factura del comercio de la mini-app con PIN/OTP
	 * (`POST /miniapps/{slug}/pay`). La clave de idempotencia se mantiene en
	 * todo reintento del mismo intento (ver `helpers/idempotency`).
	 */
	pay: async (slug: string, { invoiceUuid, pin, idempotencyKey }: MiniAppPayInput): Promise<ApiResult<MiniAppPayResult>> => {
		// `duplicate` viaja al lado de `data` (no dentro): se captura antes de desenvolver
		let duplicate = false
		const result = await wrap<MiniAppPayment>(async () => {
			const response = await apiClient.post(`/miniapps/${encodeURIComponent(slug)}/pay`, { invoice_uuid: invoiceUuid, pin, idempotency_key: idempotencyKey })
			duplicate = response.data?.duplicate === true
			return response
		}, i18n.t('miniapps.errors.pay'))
		if (!result.success || !result.data) return result
		return { ...result, data: duplicate ? { ...result.data, duplicate: true } : result.data }
	},

	/** Consentimientos vigentes del usuario (`GET /miniapps/grants`). */
	grants: (): Promise<ApiResult<MiniAppGrant[]>> =>
		wrap(() => apiClient.get('/miniapps/grants'), i18n.t('miniapps.errors.loadGrants')),

	/** Revoca el consentimiento de una mini-app (`DELETE /miniapps/grants/{slug}`). */
	revokeGrant: (slug: string): Promise<ApiResult<{ revoked: boolean }>> =>
		wrap(() => apiClient.delete(`/miniapps/grants/${encodeURIComponent(slug)}`), i18n.t('miniapps.errors.revoke')),
}
