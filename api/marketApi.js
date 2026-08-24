import { apiClient } from './client'
import i18n from '../i18n'

/**
 * Wraps a request into the standard `{ success, data, error?, details?, status? }`
 * envelope used by every endpoint in this module.
 *
 * @param {Function} request - Thunk that performs the axios call.
 * @param {string} fallbackError - Localized message used when the backend provides none.
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
		return { success: false, error: error.message || i18n.t('api.common.networkErrorShort'), status: error.response?.status }
	}
}

/**
 * Serializes params to a query string. `true` becomes `?featured=true` — the
 * API in producción rechaza flags sin valor (`?featured=`) con 400;
 * false/null/undefined/'' are dropped.
 *
 * @param {Object} params - Query parameters.
 * @returns {string} URL-encoded query string (may be empty).
 */
const buildQuery = (params) => {
	const qs = new URLSearchParams()
	Object.entries(params || {}).forEach(([k, v]) => {
		if (v === true) qs.append(k, 'true')
		else if (v !== undefined && v !== null && v !== false && v !== '') qs.append(k, String(v))
	})
	return qs.toString()
}

/**
 * Marketplace de tiendas (comercios aprobados): vitrina pública de `shops`
 * activas con productos propios, y checkout directo por saldo.
 */
export const marketApi = {

	/**
	 * Lists approved (active) stores (`GET /market/stores`). Public.
	 *
	 * @param {{ category?: string, page?: number, take?: number }} [params] - Optional category slug and pagination.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ stores, total, page, take }`; each store carries `product_count` and up to 4 `product_images`.
	 */
	getStores: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/market/stores?${qs}` : '/market/stores'
		return wrap(() => apiClient.get(url), i18n.t('api.market.storesLoadFailed'))
	},

	/**
	 * Fetches one store's public profile plus its 12 latest products
	 * (`GET /market/stores/{slug}`). Public. More products paginate via
	 * `getCatalog({ shop: slug, page })`.
	 *
	 * @param {string} slug - Store slug.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ store, products }` (store includes real `rating_avg`/`rating_count`).
	 */
	getStore: async (slug) => {
		if (!slug) return { success: false, error: i18n.t('api.market.storeInvalid'), status: 400 }
		return wrap(() => apiClient.get(`/market/stores/${encodeURIComponent(slug)}`), i18n.t('api.market.storeLoadFailed'))
	},

	/**
	 * Fetches a product's full public sheet with variants and option axes
	 * (`GET /market/products/{uuid}`). Public.
	 *
	 * @param {string} uuid - Product uuid.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ product, shop }`.
	 */
	getProduct: async (uuid) => {
		if (!uuid) return { success: false, error: i18n.t('api.market.productInvalid'), status: 400 }
		return wrap(() => apiClient.get(`/market/products/${encodeURIComponent(uuid)}`), i18n.t('api.market.productLoadFailed'))
	},

	/**
	 * Cross-store product catalog with filters and ranking
	 * (`GET /market/catalog`). Public.
	 *
	 * @param {{ category?: string, kind?: string, q?: string, country?: string, min?: number, max?: number, shop?: string, sort?: string, page?: number, take?: number }} [params] - Catalog filters; `shop` limits to one store's products.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ products, total, page, take }`.
	 */
	getCatalog: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/market/catalog?${qs}` : '/market/catalog'
		return wrap(() => apiClient.get(url), i18n.t('api.market.catalogLoadFailed'))
	},

	/**
	 * Federated store search (`GET /shop/search`). Public. Returns products
	 * AND stores (`shops[]`) matching the query.
	 *
	 * @param {string} q - Search text (2-80 chars server-side).
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` includes `{ products, shops, total }`.
	 */
	search: async (q) => {
		if (!q || String(q).trim().length < 2) return { success: false, error: i18n.t('api.market.searchTooShort'), status: 400 }
		return wrap(() => apiClient.get(`/shop/search?${buildQuery({ q: String(q).trim() })}`, { silent: true }), i18n.t('api.market.searchFailed'))
	},

	/**
	 * Batch-revalidates cart products: fresh price, stock, variants and shop
	 * state (`GET /shop/products?uuids=`). Public, max 30 uuids, uncached
	 * server-side — this is the pre-payment source of truth.
	 *
	 * @param {string[]} uuids - Product uuids (deduped/sorted by the caller).
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ products }`.
	 */
	getProductsBatch: async (uuids) => {
		if (!Array.isArray(uuids) || uuids.length === 0) return { success: false, error: i18n.t('api.market.verifyCartEmpty'), status: 400 }
		return wrap(() => apiClient.get(`/shop/products?uuids=${encodeURIComponent(uuids.join(','))}`, { silent: true }), i18n.t('api.market.verifyCartFailed'))
	},

	/**
	 * Creates one marketplace order — the checkout (`POST /market/order`,
	 * Bearer auth). Silent: the cart UI renders per-line progress instead of
	 * the global loading bar. Idempotent per `idempotency_key` (a duplicate
	 * returns 200 with `duplicate: true`).
	 *
	 * @param {{ product_uuid: string, variant_uuid?: string, quantity?: number, note?: string, shipping_address_id?: string, gift_card_code?: string, idempotency_key: string }} body - Order payload.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ order, transaction_uuid }` on 201.
	 */
	createOrder: async (body) => {
		if (!body?.product_uuid || !body?.idempotency_key) { return { success: false, error: i18n.t('api.common.purchaseMissingData'), status: 400 } }
		return wrap(() => apiClient.post('/market/order', body, { silent: true }), i18n.t('api.common.checkoutProcessFailed'))
	},

	/**
	 * Lists the user's marketplace purchases as buyer
	 * (`GET /market/orders`, Bearer auth).
	 *
	 * @param {{ status?: string, page?: number, take?: number }} [params] - Optional status filter and pagination.
	 * @returns {Promise<Object>} `{ success, data?, error?, status? }` — `data` is `{ orders, total, page, take }`.
	 */
	getOrders: async (params = {}) => {
		const qs = buildQuery(params)
		const url = qs ? `/market/orders?${qs}` : '/market/orders'
		return wrap(() => apiClient.get(url), i18n.t('api.common.purchasesLoadFailed'))
	},
}
