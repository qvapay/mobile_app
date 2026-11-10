import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { PixCharge, PixEligibility, PixSurface } from '../types/domain'

/**
 * Body de `POST /pix/checkout`: el `source` y los mismos campos de cada compra.
 * Nunca lleva `use_satoshis`: el descuento en sats no se aplica a un pago con PIX.
 */
export type PixCheckoutInput = { source: PixSurface } & Record<string, unknown>

const fail = (err: unknown, fallbackKey: string): ApiResult<never> => {
	const error = err as ApiClientError
	if (error.response?.data) {
		const errorData = error.response.data
		return { success: false, error: errorData.error || errorData.message || i18n.t(fallbackKey), details: errorData, status: error.response.status }
	}
	return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
}

/**
 * Pago de compras con PIX: paga la compra en reales con un QR, nunca fondea el saldo.
 * Contrato en qpweb `content/docs/store/pix.mdx`. Todo va `silent`: la eligibilidad y el
 * seguimiento no deben encender el velo de carga, y el pago tiene su propio spinner.
 */
export const pixApi = {

	/**
	 * Si esta cuenta puede pagar con PIX ahora, qué compras están abiertas y cuánto cupo le queda
	 * (`GET /pix/eligibility`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data` is `PixEligibility`
	 */
	getEligibility: async (): Promise<ApiResult<PixEligibility>> => {
		try {
			const response = await apiClient.get('/pix/eligibility', { silent: true })
			return { success: true, data: response.data?.data, status: response.status }
		} catch (err) { return fail(err, 'api.pix.eligibilityFailed') }
	},

	/**
	 * Crea el cobro y devuelve el QR (`POST /pix/checkout`, 1 llamada cada 10 s). No hay clave de
	 * idempotencia porque no hace falta: la cuenta solo admite un QR abierto, así que repetir tras
	 * un timeout devuelve el mismo en un 409 `PIX_QR_OPEN`.
	 *
	 * @param body - `source` + los campos de la compra.
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is `PixCharge`; `details` lleva el `code`
	 */
	createCheckout: async (body: PixCheckoutInput): Promise<ApiResult<PixCharge>> => {
		try {
			const response = await apiClient.post('/pix/checkout', body, { silent: true })
			return { success: true, data: response.data?.data, status: response.status }
		} catch (err) { return fail(err, 'api.pix.checkoutFailed') }
	},

	/**
	 * Estado del cobro para el seguimiento (`GET /pix/checkout/{uuid}`). Un uuid ajeno es un 404.
	 *
	 * @param uuid - Cobro.
	 * @returns `{ success, data?, error?, status? }` — `data` is `PixCharge`
	 */
	getCheckout: async (uuid: string): Promise<ApiResult<PixCharge>> => {
		try {
			const response = await apiClient.get(`/pix/checkout/${encodeURIComponent(uuid)}`, { silent: true })
			return { success: true, data: response.data?.data, status: response.status }
		} catch (err) { return fail(err, 'api.pix.statusFailed') }
	},

	/**
	 * Cancela un QR abierto (`DELETE /pix/checkout/{uuid}`). Si el pago acaba de entrar responde
	 * 409 `PIX_NOT_CANCELLABLE` y la compra sigue su curso.
	 *
	 * @param uuid - Cobro.
	 * @returns `{ success, error?, details?, status? }`
	 */
	cancelCheckout: async (uuid: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.delete(`/pix/checkout/${encodeURIComponent(uuid)}`, { silent: true })
			return { success: true, data: response.data?.data, status: response.status }
		} catch (err) { return fail(err, 'api.pix.cancelFailed') }
	},
}
