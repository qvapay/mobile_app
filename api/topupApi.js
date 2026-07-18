import { apiClient } from './client'

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
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data.products` is `[{ productId, amountCUP, available }]`
	 */
	getTopupProducts: async () => {
		try {
			const response = await apiClient.get('/topup/products')
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
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
	 * @param {Object} receiptData
	 * @param {string} receiptData.receipt - iOS transactionReceipt or Android purchaseToken
	 * @param {string} receiptData.platform - 'ios' | 'android'
	 * @param {string} receiptData.productId - Store SKU (e.g. '100cuptopup')
	 * @param {string} receiptData.transactionId - Store transaction id (idempotency key)
	 * @param {string} receiptData.phoneNumber - E.164 destination number (e.g. '+5355123456')
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is `{ success?, pending?, topup? }`
	 */
	validateTopupReceipt: async (receiptData) => {
		try {
			const response = await apiClient.post('/topup/validate-receipt', receiptData)
			return { success: true, data: response.data, status: response.status }
		} catch (error) {
			if (error.response?.data) {
				const errorData = error.response.data
				return { success: false, error: errorData.error || errorData.message || 'No se pudo validar la compra', details: errorData, status: error.response.status }
			}
			return { success: false, error: error.message || 'Ha ocurrido un error de red', status: error.response?.status }
		}
	},

	/**
	 * Gets the authenticated user's top-up history (`GET /topup/history`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data.topups` is `[{ id, phoneNumber, amountCUP, status, createdAt }]`
	 */
	getTopupHistory: async () => {
		try {
			const response = await apiClient.get('/topup/history')
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},

	/**
	 * Gets the status of one top-up (`GET /topup/{id}/status`) — used to poll
	 * while a top-up is in 'processing'.
	 *
	 * @param {string} topupId - The top-up id returned by validate-receipt / history
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data.topup.status` is pending | processing | completed | failed
	 */
	getTopupStatus: async (topupId) => {
		try {
			const response = await apiClient.get(`/topup/${topupId}/status`)
			return { success: true, data: response.data, status: response.status }
		} catch (error) { return { success: false, error: error.message, status: error.response?.status } }
	},
}
