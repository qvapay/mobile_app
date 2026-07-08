import { apiClient } from './client'

/**
 * Wraps a request into the standard `{ success, data, error?, details?, status? }`
 * envelope used by every endpoint in this module.
 *
 * @param {Function} request - Thunk that performs the axios call.
 * @param {string} fallbackError - Spanish message used when the backend provides none.
 * @returns {Promise<Object>} The response envelope.
 */
const wrap = async (request, fallbackError) => {
	try {
		const response = await request()
		return { success: true, data: response.data, status: response.status }
	} catch (error) {
		if (error.response?.data) {
			const errorData = error.response.data
			return {
				success: false,
				error: errorData.error || errorData.message || fallbackError,
				details: errorData,
				status: error.response.status,
			}
		}
		return { success: false, error: error.message || 'Error de red', status: error.response?.status }
	}
}

/**
 * Serializes catalog params to a query string. `true` becomes a bare flag
 * (`?countries` instead of `?countries=true`), matching the backend's
 * mode-param style; false/null/undefined/'' are dropped.
 *
 * @param {Object} params - Query parameters.
 * @returns {string} URL-encoded query string (may be empty).
 */
const buildQuery = (params) => {
	const qs = new URLSearchParams()
	Object.entries(params || {}).forEach(([k, v]) => {
		if (v === true) qs.append(k, '')
		else if (v !== undefined && v !== null && v !== false && v !== '') qs.append(k, String(v))
	})
	return qs.toString()
}

export const storeApi = {

	// ---------------------- GIFT CARDS (VOUCHERS) ----------------------

	/**
	 * Fetches the voucher (Zendit gift cards) catalog
	 * (`GET /store/voucher-catalog`). Mutually exclusive modes via params:
	 *   `{ countries: true }` → country list with counts
	 *   `{ featured: true }`  → global top 12
	 *   `{ favorites: true }` → the user's top 6 (requires auth)
	 *   `{ categories: true, country? }` → categories with counts
	 *   `{ country: 'US' }`   → brands for that country
	 *   `{ country: 'US', brand: 'amazon' }` → offers for one brand
	 *
	 * @param {Object} [params] - Mode params as described above.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` shape depends on the mode
	 */
	getVoucherCatalog: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/store/voucher-catalog?${qs}` : '/store/voucher-catalog'
		return wrap(() => apiClient.get(url), 'No se pudo obtener el catálogo de tarjetas')
	},

	/**
	 * Purchases a gift-card voucher with QvaPay balance
	 * (`POST /store/voucher/purchase`). Validates required fields client-side
	 * and short-circuits with a local `status: 400` when any is missing.
	 *
	 * @param {{ offer_id: string, country: string, brand: string, amount?: number }} body - Purchase payload (`amount` only for variable-value offers).
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the purchase with redemption info
	 */
	purchaseVoucher: async (body) => {
		if (!body?.offer_id || !body?.country || !body?.brand) {
			return { success: false, error: 'Faltan datos para la compra', status: 400 }
		}
		return wrap(() => apiClient.post('/store/voucher/purchase', body), 'No se pudo realizar la compra')
	},

	// ---------------------- TOPUPS (LATAM + CUBA) ----------------------

	/**
	 * Fetches the unified phone top-up catalog (`GET /store/topup-catalog`).
	 * Cuba resolves to Cubacel packages (`source: 'cuba'`); every other
	 * country returns Zendit brands (`source: 'global'`). Modes:
	 *   `{ countries: true }` | `{ featured: true }`
	 *   `{ country: 'CU' }` | `{ country: 'MX', brand: 'telcel', subType? }`
	 *
	 * @param {Object} [params] - Mode params as described above.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` shape depends on the mode
	 */
	getTopupCatalog: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/store/topup-catalog?${qs}` : '/store/topup-catalog'
		return wrap(() => apiClient.get(url), 'No se pudo obtener el catálogo de recargas')
	},

	/**
	 * Purchases a LATAM (Zendit) phone top-up (`POST /store/topup`).
	 * Validates required fields client-side (local `status: 400` when missing).
	 * For Cuban numbers use `purchasePhonePackage` instead.
	 *
	 * @param {{ offer_id: string, phone_number: string, country: string, amount?: number }} body - Top-up payload.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	purchaseTopup: async (body) => {
		if (!body?.offer_id || !body?.phone_number || !body?.country) {
			return { success: false, error: 'Faltan datos para la recarga', status: 400 }
		}
		return wrap(() => apiClient.post('/store/topup', body), 'No se pudo realizar la recarga')
	},

	/**
	 * Purchases a Cubacel phone package for Cuba (`POST /store/phone_package`).
	 * Validates required fields client-side (local `status: 400` when missing).
	 *
	 * @param {{ phone_package_id: string|number, phone_number: string }} body - Package payload.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }`
	 */
	purchasePhonePackage: async (body) => {
		if (!body?.phone_package_id || !body?.phone_number) {
			return { success: false, error: 'Faltan datos para la recarga', status: 400 }
		}
		return wrap(() => apiClient.post('/store/phone_package', body), 'No se pudo realizar la recarga')
	},

	// ---------------------- PURCHASES ----------------------

	/**
	 * Lists the user's store purchases — vouchers and top-ups (`GET /store/my`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the purchases list
	 */
	getMyPurchases: async () => wrap(() => apiClient.get('/store/my'), 'No se pudieron obtener tus compras'),

	/**
	 * Gets one purchase with its redemption details (`GET /store/my/{id}`).
	 *
	 * @param {string|number} id - Purchase identifier from `getMyPurchases`.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` is the full purchase (codes, PINs, status)
	 */
	getPurchaseDetail: async (id) => wrap(() => apiClient.get(`/store/my/${id}`), 'No se pudo obtener el detalle'),
}
