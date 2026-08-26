import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Filtros de `getStores`: slug de categoría y paginación. */
export type MarketStoresParams = { category?: string, page?: number, take?: number }

/** Filtros de `getCatalog`; `shop` limita a los productos de una tienda. */
export type MarketCatalogParams = {
	category?: string
	kind?: string
	q?: string
	country?: string
	min?: number
	max?: number
	shop?: string
	sort?: string
	page?: number
	take?: number
}

/** Body de `createOrder` (el checkout del marketplace). */
export type MarketOrderInput = {
	product_uuid: string
	variant_uuid?: string
	quantity?: number
	note?: string
	shipping_address_id?: string
	gift_card_code?: string
	idempotency_key: string
}

/** Filtros de `getOrders`: estado y paginación. */
export type MarketOrdersParams = { status?: string, page?: number, take?: number }

/**
 * Wraps a request into the standard `{ success, data, error?, details?, status? }`
 * envelope used by every endpoint in this module.
 *
 * @param request - Thunk that performs the axios call.
 * @param fallbackError - Localized message used when the backend provides none.
 * @returns The response envelope.
 */
const wrap = async <T = unknown>(request: () => Promise<{ data: T, status: number }>, fallbackError: string): Promise<ApiResult<T>> => {
	try {
		const response = await request()
		return { success: true, data: response.data, status: response.status }
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

/**
 * Serializes params to a query string. `true` becomes `?featured=true` — the
 * API in producción rechaza flags sin valor (`?featured=`) con 400;
 * false/null/undefined/'' are dropped.
 *
 * @param params - Query parameters.
 * @returns URL-encoded query string (may be empty).
 */
const buildQuery = (params: Record<string, unknown> | null | undefined): string => {
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
	 * @param params - Optional category slug and pagination.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ stores, total, page, take }`; each store carries `product_count` and up to 4 `product_images`.
	 */
	getStores: async (params: MarketStoresParams = {}): Promise<ApiResult<unknown>> => {
		const qs = buildQuery(params)
		const url = qs ? `/market/stores?${qs}` : '/market/stores'
		return wrap(() => apiClient.get(url), i18n.t('api.market.storesLoadFailed'))
	},

	/**
	 * Fetches one store's public profile plus its 12 latest products
	 * (`GET /market/stores/{slug}`). Public. More products paginate via
	 * `getCatalog({ shop: slug, page })`.
	 *
	 * @param slug - Store slug.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ store, products }` (store includes real `rating_avg`/`rating_count`).
	 */
	getStore: async (slug: string): Promise<ApiResult<unknown>> => {
		if (!slug) return { success: false, error: i18n.t('api.market.storeInvalid'), status: 400 }
		return wrap(() => apiClient.get(`/market/stores/${encodeURIComponent(slug)}`), i18n.t('api.market.storeLoadFailed'))
	},

	/**
	 * Fetches a product's full public sheet with variants and option axes
	 * (`GET /market/products/{uuid}`). Public.
	 *
	 * @param uuid - Product uuid.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ product, shop }`.
	 */
	getProduct: async (uuid: string): Promise<ApiResult<unknown>> => {
		if (!uuid) return { success: false, error: i18n.t('api.market.productInvalid'), status: 400 }
		return wrap(() => apiClient.get(`/market/products/${encodeURIComponent(uuid)}`), i18n.t('api.market.productLoadFailed'))
	},

	/**
	 * Cross-store product catalog with filters and ranking
	 * (`GET /market/catalog`). Public.
	 *
	 * @param params - Catalog filters; `shop` limits to one store's products.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ products, total, page, take }`.
	 */
	getCatalog: async (params: MarketCatalogParams = {}): Promise<ApiResult<unknown>> => {
		const qs = buildQuery(params)
		const url = qs ? `/market/catalog?${qs}` : '/market/catalog'
		return wrap(() => apiClient.get(url), i18n.t('api.market.catalogLoadFailed'))
	},

	/**
	 * Federated store search (`GET /shop/search`). Public. Returns products
	 * AND stores (`shops[]`) matching the query.
	 *
	 * @param q - Search text (2-80 chars server-side).
	 * @returns `{ success, data?, error?, status? }` — `data` includes `{ products, shops, total }`.
	 */
	search: async (q: string): Promise<ApiResult<unknown>> => {
		if (!q || String(q).trim().length < 2) return { success: false, error: i18n.t('api.market.searchTooShort'), status: 400 }
		return wrap(() => apiClient.get(`/shop/search?${buildQuery({ q: String(q).trim() })}`, { silent: true }), i18n.t('api.market.searchFailed'))
	},

	/**
	 * Batch-revalidates cart products: fresh price, stock, variants and shop
	 * state (`GET /shop/products?uuids=`). Public, max 30 uuids, uncached
	 * server-side — this is the pre-payment source of truth.
	 *
	 * @param uuids - Product uuids (deduped/sorted by the caller).
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ products }`.
	 */
	getProductsBatch: async (uuids: string[]): Promise<ApiResult<unknown>> => {
		if (!Array.isArray(uuids) || uuids.length === 0) return { success: false, error: i18n.t('api.market.verifyCartEmpty'), status: 400 }
		return wrap(() => apiClient.get(`/shop/products?uuids=${encodeURIComponent(uuids.join(','))}`, { silent: true }), i18n.t('api.market.verifyCartFailed'))
	},

	/**
	 * Creates one marketplace order — the checkout (`POST /market/order`,
	 * Bearer auth). Silent: the cart UI renders per-line progress instead of
	 * the global loading bar. Idempotent per `idempotency_key` (a duplicate
	 * returns 200 with `duplicate: true`).
	 *
	 * @param body - Order payload.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ order, transaction_uuid }` on 201.
	 */
	createOrder: async (body: MarketOrderInput): Promise<ApiResult<unknown>> => {
		if (!body?.product_uuid || !body?.idempotency_key) { return { success: false, error: i18n.t('api.common.purchaseMissingData'), status: 400 } }
		return wrap(() => apiClient.post('/market/order', body, { silent: true }), i18n.t('api.common.checkoutProcessFailed'))
	},

	/**
	 * Lists the user's marketplace purchases as buyer
	 * (`GET /market/orders`, Bearer auth).
	 *
	 * @param params - Optional status filter and pagination.
	 * @returns `{ success, data?, error?, status? }` — `data` is `{ orders, total, page, take }`.
	 */
	getOrders: async (params: MarketOrdersParams = {}): Promise<ApiResult<unknown>> => {
		const qs = buildQuery(params)
		const url = qs ? `/market/orders?${qs}` : '/market/orders'
		return wrap(() => apiClient.get(url), i18n.t('api.common.purchasesLoadFailed'))
	},
}
