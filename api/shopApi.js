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
	 * @param {string} url - Full product page URL (Amazon or eBay).
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.product`
	 */
	parseProductUrl: async (url) => {
		if (!url) return { success: false, error: 'Pega el enlace del producto', status: 400 }
		return wrap(() => apiClient.post('/shop/assisted-shopping/product', { url }), 'No pudimos obtener los datos del producto')
	},

	/**
	 * Gets one product by uuid (`GET /shop/assisted-shopping/product/{uuid}`).
	 *
	 * @param {string} uuid - Product uuid.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.product`
	 */
	getProduct: async (uuid) => wrap(() => apiClient.get(`/shop/assisted-shopping/product/${uuid}`), 'No se pudo obtener el producto'),

	/**
	 * Recently searched products across all users, purchasable providers only
	 * (`GET /shop/assisted-shopping/recent`). Feeds the landing shelf.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.products`
	 */
	getRecentProducts: async () => wrap(() => apiClient.get('/shop/assisted-shopping/recent', { silent: true }), 'No se pudieron obtener los productos recientes'),

	// ---------------------- CART ----------------------

	/**
	 * Gets the open cart (`GET /shop/assisted-shopping/cart`). Empty carts come
	 * back as `{ cart: { id: null, products: [], subtotal: 0, item_count: 0 } }`.
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.cart`
	 */
	getCart: async () => wrap(() => apiClient.get('/shop/assisted-shopping/cart'), 'No se pudo obtener el carrito'),

	/**
	 * Adds a product to the open cart (`POST /shop/assisted-shopping/cart`).
	 *
	 * @param {{ product_uuid: string, quantity?: number }} body - Product uuid + quantity (1–10).
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.cart` updated
	 */
	addToCart: async (body) => {
		if (!body?.product_uuid) return { success: false, error: 'Faltan datos del producto', status: 400 }
		return wrap(() => apiClient.post('/shop/assisted-shopping/cart', body), 'No se pudo agregar al carrito')
	},

	/**
	 * Removes ONE occurrence of a product from the cart
	 * (`DELETE /shop/assisted-shopping/cart/product/{uuid}`) — quantity is
	 * encoded by repetition server-side, so call once per unit.
	 *
	 * @param {string} productUuid - Product uuid to remove.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.ok`
	 */
	removeFromCart: async (productUuid) => wrap(() => apiClient.delete(`/shop/assisted-shopping/cart/product/${productUuid}`), 'No se pudo eliminar el producto'),

	// ---------------------- CHECKOUT ----------------------

	/**
	 * Quotes the open cart for a destination state
	 * (`POST /shop/assisted-shopping/checkout/quote`). Tax rates live
	 * server-side, so this is the single source of truth for totals.
	 *
	 * @param {{ state?: string, shipping_address_id?: string }} body - 2-letter US state or saved address uuid.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.quote` = `{ subtotal, tax_rate, tax, total, minimum, meets_minimum, item_count }`
	 */
	getQuote: async (body) => {
		if (!body?.state && !body?.shipping_address_id) {
			return { success: false, error: 'Indica un estado o una dirección de envío', status: 400 }
		}
		return wrap(() => apiClient.post('/shop/assisted-shopping/checkout/quote', body, { silent: true }), 'No se pudo calcular el total')
	},

	/**
	 * Pays the open cart with QvaPay balance (`POST /shop/assisted-shopping/checkout`).
	 * Debits balance, creates the Transaction and marks the cart paid.
	 * Rate limited: 1 request / 10s per user.
	 *
	 * @param {{ shipping_address_id?: string, new_address?: Object }} body - Saved address uuid OR a new US address (`recipient_name`, `line1`, `city`, `state`, `postal_code`, ...).
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data` = `{ ok, cart_id, transaction_uuid, total, subtotal, tax, shipping_address }`
	 */
	checkout: async (body) => {
		if (!body?.shipping_address_id && !body?.new_address) { return { success: false, error: 'Selecciona o crea una dirección de envío', status: 400 } }
		return wrap(() => apiClient.post('/shop/assisted-shopping/checkout', body), 'No pudimos procesar la compra')
	},

	// ---------------------- ORDERS ----------------------

	/**
	 * Lists the user's paid assisted-shopping orders
	 * (`GET /shop/assisted-shopping/orders`). Status is one of
	 * `paid | purchased | delivered | cancelled` (Confirmado / En camino / Entregado / Cancelado).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.orders`
	 */
	getOrders: async () => wrap(() => apiClient.get('/shop/assisted-shopping/orders'), 'No se pudieron obtener tus pedidos'),

	/**
	 * Gets one order with items, totals, address and tracking
	 * (`GET /shop/assisted-shopping/orders/{id}`).
	 *
	 * @param {string|number} id - Cart/order id from `getOrders`.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.order`
	 */
	getOrder: async (id) => wrap(() => apiClient.get(`/shop/assisted-shopping/orders/${id}`), 'No se pudo obtener el pedido'),

	// ---------------------- SHIPPING ADDRESSES ----------------------

	/**
	 * Lists the user's saved US shipping addresses (`GET /user/shipping-addresses`).
	 *
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.addresses`
	 */
	getShippingAddresses: async () => wrap(() => apiClient.get('/user/shipping-addresses'), 'No se pudieron obtener tus direcciones'),

	/**
	 * Creates a US shipping address (`POST /user/shipping-addresses`).
	 *
	 * @param {{ recipient_name: string, line1: string, city: string, state: string, postal_code: string, label?: string, phone?: string, line2?: string, is_default?: boolean }} body - Address payload.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.address`
	 */
	createShippingAddress: async (body) => wrap(() => apiClient.post('/user/shipping-addresses', body), 'No se pudo guardar la dirección'),

	/**
	 * Deletes (soft) a saved shipping address (`DELETE /user/shipping-addresses/{uuid}`).
	 *
	 * @param {string} uuid - Address uuid.
	 * @returns {Promise<Object>} `{ success, data?, error?, details?, status? }` — `data.ok`
	 */
	deleteShippingAddress: async (uuid) => wrap(() => apiClient.delete(`/user/shipping-addresses/${uuid}`), 'No se pudo eliminar la dirección'),
}
