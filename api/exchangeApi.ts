import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'
import type { ExchangeCatalogPayload, ExchangeOrder, ExchangeQuotePayload } from '../types/domain'

/** Respuesta de `POST /wallet/exchange/create`. */
export type ExchangeCreatePayload = { data: ExchangeOrder, duplicate?: boolean }

export type ExchangeListPayload = {
	data: ExchangeOrder[]
	meta: { page: number, total: number, last_page: number }
}

export type ExchangeQuoteInput = {
	fromAssetId: string
	toAssetId: string
	amount: number
	/**
	 * Saldos de la wallet por assetId, en decimal humano. OPCIONAL y solo para el aviso de
	 * "lo tienes más barato en otra cadena": son saldos públicos que el backend no guarda.
	 */
	balances?: Record<string, string | number>
}

export type ExchangeCreateInput = {
	/** Cotización congelada. Sin ella no se abre nada: se ejecuta lo que el usuario vio. */
	quoteId: string
	fromAssetId: string
	toAssetId: string
	amount: number
	/** Wallet del propio usuario en la cadena de destino. */
	payoutAddress: string
	/** Wallet del propio usuario en la cadena de ORIGEN. Obligatoria: es adonde vuelve si falla. */
	refundAddress: string
	/** `[A-Za-z0-9._-]{8,64}`, estable en todo reintento del MISMO pedido. */
	idempotencyKey: string
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
 * Intercambio cripto↔cripto de la wallet non-custodial.
 *
 * MODELO DE DIRECCIÓN DE DEPÓSITO: QvaPay no custodia nada. El backend abre la operación en
 * el proveedor y devuelve una dirección; el teléfono envía ahí con el motor de envío de
 * siempre (firma local, verificación intacta) y el proveedor paga a la wallet del usuario.
 * Durante esos minutos los fondos están en el proveedor, y la pantalla lo dice.
 *
 * Dos cosas que NO son negociables al llamar a `create`:
 *   - el importe enviado tiene que ser EXACTAMENTE el cotizado (de más o de menos dispara
 *     recotización o devolución del proveedor), así que no hay "enviar todo" en este flujo;
 *   - `refundAddress` siempre, y en la cadena de ORIGEN: es adonde vuelve el dinero si la
 *     operación falla o el importe queda fuera de rango.
 *
 * `details` conserva el body de error, donde viaja el `code` que decide el copy:
 * `BELOW_MINIMUM` (con `min_amount`), `ASSET_NOT_SUPPORTED`, `SAME_ASSET`, `NO_PROVIDER`,
 * `QUOTE_EXPIRED`, `PAYOUT_NOT_OWN`, `REFUND_NOT_OWN`, `DUPLICATE_REQUEST`,
 * `PROVIDER_UNAVAILABLE`, `SANCTIONS_BLOCKED`.
 */
export const exchangeApi = {

	/**
	 * Qué se puede intercambiar (`GET /wallet/exchange/quote`). Los NO soportados vienen con
	 * su motivo a propósito: la pantalla lo explica en vez de hacer desaparecer el activo.
	 * Catálogo estable: cachear con holgura.
	 */
	catalog: async (): Promise<ApiResult<ExchangeCatalogPayload>> => {
		try {
			const response = await apiClient.get<ExchangeCatalogPayload>('/wallet/exchange/quote', { silent: true })
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.exchange.catalogFailed') }
	},

	/**
	 * Cotiza y congela (`POST /wallet/exchange/quote`). Cotizar no compromete nada; la
	 * congelación dura 2 minutos para que lo que el usuario confirma sea lo que vio.
	 *
	 * Un 400 con `BELOW_MINIMUM` trae `min_amount` en `details`: es información útil, no solo
	 * un error — la pantalla puede ofrecer subir al mínimo.
	 */
	quote: async ({ fromAssetId, toAssetId, amount, balances }: ExchangeQuoteInput): Promise<ApiResult<ExchangeQuotePayload>> => {
		try {
			const response = await apiClient.post<{ data: ExchangeQuotePayload }>('/wallet/exchange/quote', {
				from_asset: fromAssetId,
				to_asset: toAssetId,
				amount,
				...(balances ? { balances } : {}),
			}, { silent: true })
			return { success: true, data: response.data.data, status: response.status }
		} catch (err) { return fail(err, 'api.exchange.quoteFailed') }
	},

	/**
	 * Abre la operación (`POST /wallet/exchange/create`) → 201 con la dirección de depósito.
	 *
	 * NO mueve dinero: eso lo hace el envío que viene después. Un replay de la misma clave
	 * devuelve 200 con `duplicate: true` y la operación ORIGINAL — se trata como éxito.
	 */
	create: async ({ quoteId, fromAssetId, toAssetId, amount, payoutAddress, refundAddress, idempotencyKey }: ExchangeCreateInput): Promise<ApiResult<ExchangeCreatePayload>> => {
		try {
			const response = await apiClient.post<ExchangeCreatePayload>('/wallet/exchange/create', {
				quote_id: quoteId,
				from_asset: fromAssetId,
				to_asset: toAssetId,
				amount,
				payout_address: payoutAddress,
				refund_address: refundAddress,
				idempotency_key: idempotencyKey,
			})
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.exchange.createFailed') }
	},

	/**
	 * Estado fresco de una operación (`GET /wallet/exchange/{uuid}`). El backend consulta al
	 * proveedor si sigue viva; es la respuesta a "¿dónde está mi dinero?" mientras dura.
	 */
	get: async (uuid: string): Promise<ApiResult<ExchangeOrder>> => {
		try {
			const response = await apiClient.get<{ data: ExchangeOrder }>(`/wallet/exchange/${uuid}`, { silent: true })
			return { success: true, data: response.data.data, status: response.status }
		} catch (err) { return fail(err, 'api.exchange.detailFailed') }
	},

	/** Historial de intercambios (`GET /wallet/exchange`). */
	list: async ({ page = 1, status }: { page?: number, status?: string } = {}): Promise<ApiResult<ExchangeListPayload>> => {
		try {
			const response = await apiClient.get<ExchangeListPayload>('/wallet/exchange', {
				params: { page, ...(status ? { status } : {}) },
				silent: true,
			})
			return { success: true, data: response.data, status: response.status }
		} catch (err) { return fail(err, 'api.exchange.listFailed') }
	},
}
