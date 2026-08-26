import { apiClient } from './client'
import i18n from '../i18n'
import type { ApiClientError, ApiResult } from '../types/api'

/** Body de `addToCart`: uuid del producto + cantidad (1–10). */
export type ShopAddToCartInput = { product_uuid: string, quantity?: number }

/** Destino de `getQuote`: estado US de 2 letras o uuid de dirección guardada. */
export type ShopQuoteInput = { state?: string, shipping_address_id?: string }

/** Payload de dirección US de `createShippingAddress`. */
export type ShopShippingAddressInput = {
	recipient_name: string
	line1: string
	city: string
	state: string
	postal_code: string
	label?: string
	phone?: string
	line2?: string
	is_default?: boolean
}

/** Body de `checkout`: uuid de dirección guardada O una dirección US nueva. */
export type ShopCheckoutInput = {
	shipping_address_id?: string
	new_address?: ShopShippingAddressInput & Record<string, unknown>
}

/** Body de `autocompleteAddress`: dirección parcial (mín 3 chars) + token de sesión. */
export type ShopAutocompleteInput = { q: string, session: string }

/** Body de `getPlaceDetails`: id de sugerencia + el mismo token de sesión del autocomplete. */
export type ShopPlaceDetailsInput = { place_id: string, session: string }

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
 * Assisted-shopping (Personal Shopper) API: paste a store URL, we scrape it,
 * you pay with QvaPay balance and the fulfillment team buys and ships it.
 * Amazon (0% fee) and eBay (+1%) today; Walmart/BestBuy coming soon.
 * Only US shipping addresses; cart minimum $20; state tax added at checkout.
 */
export const shopApi = {

	// ---------------------- PRODUCTS ----------------------

	/**
	 * Resolves a store product URL into a purchasable product
	 * (`POST /shop/assisted-shopping/product`). Scrapes/reuses the product and
	 * returns it with `qp_price` (store price + provider fee). Short links
	 * (a.co, amzn.to, ebay.us) are rejected by the backend.
	 * Rate limited: 3 requests / 6s per user.
	 *
	 * @param url - Full product page URL (Amazon or eBay).
	 * @returns `{ success, data?, error?, details?, status? }` — `data.product`
	 */
	parseProductUrl: async (url: string): Promise<ApiResult<unknown>> => {
		if (!url) return { success: false, error: i18n.t('api.shop.productLinkMissing'), status: 400 }
		return wrap(() => apiClient.post('/shop/assisted-shopping/product', { url }), i18n.t('api.shop.productDataLoadFailed'))
	},

	/**
	 * Gets one product by uuid (`GET /shop/assisted-shopping/product/{uuid}`).
	 *
	 * @param uuid - Product uuid.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.product`
	 */
	getProduct: async (uuid: string): Promise<ApiResult<unknown>> => wrap(() => apiClient.get(`/shop/assisted-shopping/product/${uuid}`), i18n.t('api.shop.productLoadFailed')),

	/**
	 * Recently searched products across all users, purchasable providers only
	 * (`GET /shop/assisted-shopping/recent`). Feeds the landing shelf.
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data.products`
	 */
	getRecentProducts: async (): Promise<ApiResult<unknown>> => wrap(() => apiClient.get('/shop/assisted-shopping/recent', { silent: true }), i18n.t('api.shop.recentProductsLoadFailed')),

	// ---------------------- CART ----------------------

	/**
	 * Gets the open cart (`GET /shop/assisted-shopping/cart`). Empty carts come
	 * back as `{ cart: { id: null, products: [], subtotal: 0, item_count: 0 } }`.
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data.cart`
	 */
	getCart: async (): Promise<ApiResult<unknown>> => wrap(() => apiClient.get('/shop/assisted-shopping/cart'), i18n.t('api.shop.cartLoadFailed')),

	/**
	 * Adds a product to the open cart (`POST /shop/assisted-shopping/cart`).
	 *
	 * @param body - Product uuid + quantity (1–10).
	 * @returns `{ success, data?, error?, details?, status? }` — `data.cart` updated
	 */
	addToCart: async (body: ShopAddToCartInput): Promise<ApiResult<unknown>> => {
		if (!body?.product_uuid) return { success: false, error: i18n.t('api.shop.productMissingData'), status: 400 }
		return wrap(() => apiClient.post('/shop/assisted-shopping/cart', body), i18n.t('api.shop.cartAddFailed'))
	},

	/**
	 * Removes ONE occurrence of a product from the cart
	 * (`DELETE /shop/assisted-shopping/cart/product/{uuid}`) — quantity is
	 * encoded by repetition server-side, so call once per unit.
	 *
	 * @param productUuid - Product uuid to remove.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.ok`
	 */
	removeFromCart: async (productUuid: string): Promise<ApiResult<unknown>> => wrap(() => apiClient.delete(`/shop/assisted-shopping/cart/product/${productUuid}`), i18n.t('api.shop.cartRemoveFailed')),

	// ---------------------- CHECKOUT ----------------------

	/**
	 * Quotes the open cart for a destination state
	 * (`POST /shop/assisted-shopping/checkout/quote`). Tax rates live
	 * server-side, so this is the single source of truth for totals.
	 *
	 * @param body - 2-letter US state or saved address uuid.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.quote` = `{ subtotal, tax_rate, tax, total, minimum, meets_minimum, item_count }`
	 */
	getQuote: async (body: ShopQuoteInput): Promise<ApiResult<unknown>> => {
		if (!body?.state && !body?.shipping_address_id) {
			return { success: false, error: i18n.t('api.shop.quoteMissingDestination'), status: 400 }
		}
		return wrap(() => apiClient.post('/shop/assisted-shopping/checkout/quote', body, { silent: true }), i18n.t('api.shop.quoteFailed'))
	},

	/**
	 * Pays the open cart with QvaPay balance (`POST /shop/assisted-shopping/checkout`).
	 * Debits balance, creates the Transaction and marks the cart paid.
	 * Rate limited: 1 request / 10s per user.
	 *
	 * @param body - Saved address uuid OR a new US address (`recipient_name`, `line1`, `city`, `state`, `postal_code`, ...).
	 * @returns `{ success, data?, error?, details?, status? }` — `data` = `{ ok, cart_id, transaction_uuid, total, subtotal, tax, shipping_address }`
	 */
	checkout: async (body: ShopCheckoutInput): Promise<ApiResult<unknown>> => {
		if (!body?.shipping_address_id && !body?.new_address) { return { success: false, error: i18n.t('api.shop.checkoutMissingAddress'), status: 400 } }
		return wrap(() => apiClient.post('/shop/assisted-shopping/checkout', body), i18n.t('api.common.checkoutProcessFailed'))
	},

	// ---------------------- ORDERS ----------------------

	/**
	 * Lists the user's paid assisted-shopping orders
	 * (`GET /shop/assisted-shopping/orders`). Status is one of
	 * `paid | purchased | delivered | cancelled` (Confirmado / En camino / Entregado / Cancelado).
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data.orders`
	 */
	getOrders: async (): Promise<ApiResult<unknown>> => wrap(() => apiClient.get('/shop/assisted-shopping/orders'), i18n.t('api.shop.ordersLoadFailed')),

	/**
	 * Gets one order with items, totals, address and tracking
	 * (`GET /shop/assisted-shopping/orders/{id}`).
	 *
	 * @param id - Cart/order id from `getOrders`.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.order`
	 */
	getOrder: async (id: string | number): Promise<ApiResult<unknown>> => wrap(() => apiClient.get(`/shop/assisted-shopping/orders/${id}`), i18n.t('api.shop.orderLoadFailed')),

	// ---------------------- SHIPPING ADDRESSES ----------------------

	/**
	 * Lists the user's saved US shipping addresses (`GET /user/shipping-addresses`).
	 *
	 * @returns `{ success, data?, error?, details?, status? }` — `data.addresses`
	 */
	getShippingAddresses: async (): Promise<ApiResult<unknown>> => wrap(() => apiClient.get('/user/shipping-addresses'), i18n.t('api.shop.addressesLoadFailed')),

	/**
	 * Creates a US shipping address (`POST /user/shipping-addresses`).
	 *
	 * @param body - Address payload.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.address`
	 */
	createShippingAddress: async (body: ShopShippingAddressInput): Promise<ApiResult<unknown>> => wrap(() => apiClient.post('/user/shipping-addresses', body), i18n.t('api.shop.addressSaveFailed')),

	/**
	 * Autocompletes a partial US address (`POST /user/shipping-addresses/autocomplete`).
	 * Proxied through the backend so the Google Places key never ships in the
	 * app. Debounce calls (~300ms) and reuse the same `session` token for the
	 * whole typing session — Google bills autocomplete + details as one session.
	 * Rate limited: ~5 req / 5s per user.
	 *
	 * @param body - Partial address (min 3 chars) + session token.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.suggestions` = `[{ place_id, text }]`
	 */
	autocompleteAddress: async (body: ShopAutocompleteInput): Promise<ApiResult<unknown>> => wrap(() => apiClient.post('/user/shipping-addresses/autocomplete', body, { silent: true }), i18n.t('api.shop.addressSearchFailed')),

	/**
	 * Resolves a Places suggestion into structured address fields
	 * (`POST /user/shipping-addresses/place-details`).
	 *
	 * @param body - Suggestion id + the same session token used to autocomplete.
	 * @returns `{ success, data?, error?, details?, status? }` — `data` = `{ address: { line1, city, state, postal_code, country }, formatted }`
	 */
	getPlaceDetails: async (body: ShopPlaceDetailsInput): Promise<ApiResult<unknown>> => wrap(() => apiClient.post('/user/shipping-addresses/place-details', body, { silent: true }), i18n.t('api.shop.addressLoadFailed')),

	/**
	 * Deletes (soft) a saved shipping address (`DELETE /user/shipping-addresses/{uuid}`).
	 *
	 * @param uuid - Address uuid.
	 * @returns `{ success, data?, error?, details?, status? }` — `data.ok`
	 */
	deleteShippingAddress: async (uuid: string): Promise<ApiResult<unknown>> => wrap(() => apiClient.delete(`/user/shipping-addresses/${uuid}`), i18n.t('api.shop.addressDeleteFailed')),
}
