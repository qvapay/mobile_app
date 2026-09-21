import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { EnergyDuration, EnergyOrder, EnergyPricesPayload, EnergyQuote } from '../types/domain'

/** Respuesta de `POST /v2/energy/rent`. `balance` no viaja en el replay de una clave ya usada. */
export type EnergyRentPayload = { data: EnergyOrder, balance?: number, duplicate?: boolean }

export type EnergyOrdersPayload = {
	data: EnergyOrder[]
	meta: { page: number, take: number, total: number, last_page: number }
}

export type EnergyRentInput = {
	/** Dirección que recibe la delegación: la que FIRMA la transacción. */
	targetAddress: string
	volume: number
	duration: EnergyDuration
	/** Obligatoria: `[A-Za-z0-9._-]{8,64}`, estable en todo reintento del MISMO pedido. */
	idempotencyKey: string
	/** Cotización congelada; sin ella se compra al precio vivo. */
	quoteId?: string
	/** Techo de precio. Se manda SIEMPRE, incluso con cotización: es la protección que no caduca. */
	maxPriceUsd?: number
}

const fail = (err: unknown, fallbackKey: string): ApiResult<never> => {
	const error = err as ApiClientError
	if (error.response?.data) {
		const errorData = error.response.data
		return { success: false, error: errorData.error || errorData.message || i18n.t(fallbackKey), details: errorData, status: error.response.status }
	}
	return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
}

/**
 * Alquiler de energía TRON: QvaPay compra la delegación y la cobra del saldo
 * del usuario. Enviar USDT-TRC20 sin energía quema entre 13 y 28 TRX;
 * alquilarla cuesta céntimos.
 *
 * `details` conserva el body de error, que es donde viaja lo que decide el
 * copy: `code` (`INSUFFICIENT_BALANCE`, `LIMIT_EXCEEDED`, `ADDRESS_NOT_ACTIVATED`,
 * `QUOTE_EXPIRED`, `DUPLICATE_REQUEST`, `DELIVERY_FAILED`, `PROVIDER_UNAVAILABLE`…)
 * y, en el 403 del tope diario, `remaining`.
 */
export const energyApi = {

	/**
	 * Tabla de precios del momento (`GET /v2/energy/prices`): los montos
	 * populares por cada duración más el precio unitario. 503 cuando el
	 * alquiler no está disponible — es también la señal de disponibilidad de
	 * todo el módulo. Rate limit de 3/10s: una sola query compartida.
	 */
	prices: async (): Promise<ApiResult<EnergyPricesPayload>> => {
		try {
			const response = await apiClient.get<EnergyPricesPayload>('/v2/energy/prices', { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.energy.pricesFailed') }
	},

	/** Congela el precio 90 s y devuelve el `quote_id` con el que comprarlo. */
	quote: async (volume: number, duration: EnergyDuration): Promise<ApiResult<{ data: EnergyQuote }>> => {
		try {
			const response = await apiClient.post<{ data: EnergyQuote }>('/v2/energy/quote', { volume, duration })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.energy.quoteFailed') }
	},

	/**
	 * Cobra del saldo y delega la energía. `201` entregada · `202` cobrada y
	 * en curso (consultar `order`) · `200` con `duplicate: true` si la clave ya
	 * se usó · `502 DELIVERY_FAILED` con el saldo YA devuelto.
	 */
	rent: async (input: EnergyRentInput): Promise<ApiResult<EnergyRentPayload>> => {
		try {
			const payload: Record<string, unknown> = {
				target_address: input.targetAddress,
				volume: input.volume,
				duration: input.duration,
				idempotency_key: input.idempotencyKey,
			}
			if (input.quoteId) { payload.quote_id = input.quoteId }
			if (typeof input.maxPriceUsd === 'number') { payload.max_price_usd = input.maxPriceUsd }
			const response = await apiClient.post<EnergyRentPayload>('/v2/energy/rent', payload)
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.energy.rentFailed') }
	},

	/** Historial de órdenes de la cuenta, 20 por página, de la más reciente a la más antigua. */
	orders: async ({ page = 1, status }: { page?: number, status?: string } = {}): Promise<ApiResult<EnergyOrdersPayload>> => {
		try {
			const params = new URLSearchParams({ page: String(page) })
			if (status) { params.append('status', status) }
			const response = await apiClient.get<EnergyOrdersPayload>(`/v2/energy/orders?${params.toString()}`, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.energy.ordersFailed') }
	},

	/**
	 * Estado de una orden. Es lo que se consulta tras un 202: la propia
	 * consulta cierra la orden preguntando al proveedor, así que el polling
	 * del cliente la resuelve en el acto en vez de esperar al cron.
	 */
	order: async (uuid: string): Promise<ApiResult<{ data: EnergyOrder }>> => {
		try {
			const response = await apiClient.get<{ data: EnergyOrder }>(`/v2/energy/orders/${uuid}`, { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.energy.ordersFailed') }
	},
}

export default energyApi
