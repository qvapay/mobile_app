import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Body de `validateTopupReceipt`: el recibo del store + destino de la recarga. */
export type TopupReceiptInput = {
	/** iOS transactionReceipt or Android purchaseToken */
	receipt: string
	platform: 'ios' | 'android'
	/** Store SKU (e.g. '100cuptopup') */
	productId: string
	/** Store transaction id (idempotency key) */
	transactionId: string
	/** E.164 destination number (e.g. '+5355123456') */
	phoneNumber: string
}

/**
 * Mobile top-ups purchased through the native stores (Google Play Billing /
 * StoreKit) as consumable one-time products. The client never executes the
 * top-up itself: it sends the store receipt to the backend, which verifies it
 * against the store's server API, runs the real top-up and (as a fallback)
 * consumes/acknowledges the purchase server-side. See helpers/iap.js for the
 * SKU catalog.
 */
export const topupApi = {

	/**
	 * Gets the top-up catalog with backend-side availability (`GET /topup/products`).
	 * Store prices are NOT here — they come from react-native-iap's fetchProducts;
	 * this endpoint only says which products are currently purchasable.
	 *
	 * @returns `{ success, data?, error?, status? }` — `data.products` is `[{ productId, amountCUP, available }]`
	 */
	getTopupProducts: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get('/topup/products')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Validates a consumable purchase receipt and triggers the real top-up
	 * (`POST /topup/validate-receipt`). The backend verifies the receipt with
	 * the store, checks idempotency by `transactionId`, executes the top-up to
	 * `phoneNumber` and registers the transaction.
	 *
	 * Contract with the purchase flow: only a `data.success` response allows the
	 * client to consume the purchase (`finishTransaction`); `data.pending` /
	 * HTTP 202 means the top-up is still processing and the backend will consume
	 * the purchase server-side once it settles — do NOT consume client-side.
	 *
	 * @param receiptData - Receipt payload: `receipt` (iOS transactionReceipt or Android purchaseToken), `platform`, `productId`, `transactionId`, `phoneNumber`
	 * @returns `{ success, data?, error?, details?, status? }` — `data` is `{ success?, pending?, topup? }`
	 */
	validateTopupReceipt: async (receiptData: TopupReceiptInput): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.post('/topup/validate-receipt', receiptData)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || i18n.t('api.common.purchaseValidateFailed'), details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || i18n.t('api.common.networkError'), status: error.response?.status }
		}
	},

	/**
	 * Gets the authenticated user's top-up history (`GET /topup/history`).
	 *
	 * @returns `{ success, data?, error?, status? }` — `data.topups` is `[{ id, phoneNumber, amountCUP, status, createdAt }]`
	 */
	getTopupHistory: async (): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get('/topup/history')
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},

	/**
	 * Gets the status of one top-up (`GET /topup/{id}/status`) — used to poll
	 * while a top-up is in 'processing'.
	 *
	 * @param topupId - The top-up id returned by validate-receipt / history
	 * @returns `{ success, data?, error?, status? }` — `data.topup.status` is pending | processing | completed | failed
	 */
	getTopupStatus: async (topupId: string): Promise<ApiResult<unknown>> => {
		try {
			const response = await apiClient.get(`/topup/${topupId}/status`)
			return { success: true, data: response.data, status: response.status }
		} catch (err) {
			const error = err as ApiClientError
			return { success: false, error: error.message, status: error.response?.status }
		}
	},
}
