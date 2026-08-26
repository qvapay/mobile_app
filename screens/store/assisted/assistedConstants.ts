/**
 * Shared constants for the assisted-shopping (Personal Shopper) flow.
 * Store availability and fees mirror the backend provider registry
 * (qpweb scripts/providers/shop/index.js) — the backend is the source of
 * truth; this list only drives the marketing UI on the landing screen.
 *
 * También es el módulo hoja donde viven las FORMAS de dominio de la carpeta
 * (producto parseado, ítem de carrito, carrito, quote, pedido). No están en
 * `types/domain.ts` porque solo las consumen estas pantallas; se derivan
 * únicamente de los campos que el código de la carpeta lee.
 */
import type { FontAwesome6BrandIconName } from '@react-native-vector-icons/fontawesome6'

/**
 * Importe tal y como llega del backend: número, decimal serializado o vacío.
 * `money()` normaliza cualquiera de las tres formas.
 */
export type MoneyValue = number | string | null | undefined

/** Proveedores conocidos por el registro del backend. */
export type AssistedProvider = 'amazon' | 'ebay' | 'walmart' | 'bestbuy' | 'temu' | 'aliexpress' | 'shein'

/**
 * Producto asistido tal y como lo devuelve el backend (`POST/GET
 * /shop/assisted-shopping/product`, `/recent`). Solo los campos que leen las
 * pantallas de la carpeta.
 *
 * `price` y `qp_price` se tipan `number` porque el código los multiplica sin
 * convertir (`item.qp_price * item.count` en carrito y detalle de pedido);
 * `qp_price` ya trae la comisión del proveedor incluida (0% Amazon, +1% eBay).
 */
export type AssistedProductData = {
	uuid: string
	title: string
	/** URL original de la ficha en la tienda (Amazon/eBay); AssistedProduct la abre sin guard. */
	url: string
	provider?: AssistedProvider | string
	main_image?: string | null
	images?: string[] | null
	description?: string | null
	/** Precio de la tienda, sin comisión. */
	price?: number
	/** Precio QvaPay = precio de tienda + comisión del proveedor. */
	qp_price: number
}

/**
 * Ítem de carrito o de pedido: el producto + `count`. La cantidad se codifica
 * server-side REPITIENDO el id del producto, así que `count` es el número de
 * ocurrencias agrupadas que devuelve el backend.
 */
export type AssistedCartItem = AssistedProductData & { count: number }

/**
 * Carrito abierto (`GET /shop/assisted-shopping/cart`). Un carrito vacío llega
 * como `{ id: null, products: [], subtotal: 0, item_count: 0 }`.
 */
export type AssistedCartData = {
	id: number | null
	products?: AssistedCartItem[]
	subtotal?: MoneyValue
	item_count?: number
}

/**
 * Quote de impuestos del checkout (`POST /shop/assisted-shopping/checkout/quote`).
 * Las tasas por estado viven SOLO en el backend: el cliente nunca calcula el
 * impuesto, solo pinta lo que devuelve este objeto.
 */
export type AssistedQuote = {
	subtotal: MoneyValue
	/** Estado US del destino; no está documentado en shopApi pero QuoteSummary lo pinta. */
	state?: string
	tax_rate: number
	tax: MoneyValue
	total: MoneyValue
	minimum?: number
	meets_minimum?: boolean
	item_count?: number
}

/** Snapshot de la dirección de envío guardada dentro de un pedido. */
export type AssistedOrderAddress = {
	recipient_name?: string | null
	line1?: string | null
	line2?: string | null
	city?: string | null
	state?: string | null
	postal_code?: string | null
	country?: string | null
	phone?: string | null
}

/** Pedido asistido (`GET /shop/assisted-shopping/orders` y `/orders/{id}`). */
export type AssistedOrder = {
	id: number | string
	status?: AssistedOrderStatus | string
	items?: AssistedCartItem[]
	item_count?: number
	subtotal?: MoneyValue
	tax?: MoneyValue
	total?: MoneyValue
	created_at: string
	/** Id del pedido en la tienda de origen (lo rellena el equipo de fulfillment). */
	store_id?: string | number | null
	tracking_code?: string | null
	shipping_address?: AssistedOrderAddress | null
}

/** Tienda de la portada. `icon` solo existe cuando FontAwesome6 tiene el glifo de marca. */
export type AssistedStore = {
	key: AssistedProvider
	label: string
	icon?: FontAwesome6BrandIconName
	available: boolean
}

// Stores shown on the landing. `available` = purchasable today; the rest get
// the "coming soon" tag. `icon` is a FontAwesome6 brand glyph when one exists.
export const STORES: AssistedStore[] = [
	{ key: 'amazon', label: 'Amazon', icon: 'amazon', available: true },
	{ key: 'ebay', label: 'eBay', icon: 'ebay', available: true },
	{ key: 'walmart', label: 'Walmart', available: false },
	{ key: 'bestbuy', label: 'Best Buy', available: false },
	{ key: 'temu', label: 'TEMU', available: false },
	{ key: 'aliexpress', label: 'AliExpress', available: false },
]

// Cart minimum enforced by the backend checkout ($USD).
export const MINIMUM_CART = 20

// Human label for a product provider key.
const PROVIDER_LABELS: Record<string, string> = {
	amazon: 'Amazon',
	ebay: 'eBay',
	walmart: 'Walmart',
	bestbuy: 'Best Buy',
	temu: 'TEMU',
	aliexpress: 'AliExpress',
	shein: 'SHEIN',
}
// El cast del índice conserva la expresión original tal cual: un provider
// nulo cae por el `||` en la cadena, como hacía en JS.
export const providerLabel = (provider?: string | null): string => PROVIDER_LABELS[provider as string] || provider || ''

/** Estados de fulfillment que deriva el backend de los booleanos del Cart. */
export type AssistedOrderStatus = 'paid' | 'purchased' | 'delivered' | 'cancelled' | 'pending'

/** Metadatos de un estado: clave i18n + clave de `theme.colors`. */
export type AssistedOrderStatusMeta = {
	labelKey: string
	color: 'success' | 'warning' | 'primary' | 'danger' | 'secondaryText'
}

/**
 * Order status metadata. Status comes derived from the backend Cart booleans
 * (paid / purchased / delivered / cancelled). `labelKey` is an i18n key
 * resolved at render time (FulfillmentBadge); `color` is a theme.colors key.
 */
export const ORDER_STATUS: Record<AssistedOrderStatus, AssistedOrderStatusMeta> = {
	paid: { labelKey: 'assisted.status.paid', color: 'success' },
	purchased: { labelKey: 'assisted.status.purchased', color: 'warning' },
	delivered: { labelKey: 'assisted.status.delivered', color: 'primary' },
	cancelled: { labelKey: 'assisted.status.cancelled', color: 'danger' },
	pending: { labelKey: 'common.status.pending', color: 'secondaryText' },
}

// USD helper used across the assisted screens.
export const money = (value: MoneyValue): string => `$${Number(value || 0).toFixed(2)}`

/**
 * Derives the QvaPay fee percent from the stored prices (same trick the web
 * ProductView uses): qp_price already includes the provider commission.
 *
 * @returns Rounded percent (0 when there is no markup).
 */
export const feePercent = (price: MoneyValue, qpPrice: MoneyValue): number => {
	const p = Number(price)
	const qp = Number(qpPrice)
	if (!p || !qp || qp <= p) return 0
	return Math.round(((qp / p) - 1) * 100)
}

/** Estado US aceptado por el backend: código de 2 letras + nombre. */
export type UsState = { code: string, name: string }

// US states accepted by the backend (US_STATES in qpweb scripts/shop/us-state-tax.js).
export const US_STATES: UsState[] = [
	{ code: 'AL', name: 'Alabama' },
	{ code: 'AK', name: 'Alaska' },
	{ code: 'AZ', name: 'Arizona' },
	{ code: 'AR', name: 'Arkansas' },
	{ code: 'CA', name: 'California' },
	{ code: 'CO', name: 'Colorado' },
	{ code: 'CT', name: 'Connecticut' },
	{ code: 'DE', name: 'Delaware' },
	{ code: 'DC', name: 'District of Columbia' },
	{ code: 'FL', name: 'Florida' },
	{ code: 'GA', name: 'Georgia' },
	{ code: 'HI', name: 'Hawaii' },
	{ code: 'ID', name: 'Idaho' },
	{ code: 'IL', name: 'Illinois' },
	{ code: 'IN', name: 'Indiana' },
	{ code: 'IA', name: 'Iowa' },
	{ code: 'KS', name: 'Kansas' },
	{ code: 'KY', name: 'Kentucky' },
	{ code: 'LA', name: 'Louisiana' },
	{ code: 'ME', name: 'Maine' },
	{ code: 'MD', name: 'Maryland' },
	{ code: 'MA', name: 'Massachusetts' },
	{ code: 'MI', name: 'Michigan' },
	{ code: 'MN', name: 'Minnesota' },
	{ code: 'MS', name: 'Mississippi' },
	{ code: 'MO', name: 'Missouri' },
	{ code: 'MT', name: 'Montana' },
	{ code: 'NE', name: 'Nebraska' },
	{ code: 'NV', name: 'Nevada' },
	{ code: 'NH', name: 'New Hampshire' },
	{ code: 'NJ', name: 'New Jersey' },
	{ code: 'NM', name: 'New Mexico' },
	{ code: 'NY', name: 'New York' },
	{ code: 'NC', name: 'North Carolina' },
	{ code: 'ND', name: 'North Dakota' },
	{ code: 'OH', name: 'Ohio' },
	{ code: 'OK', name: 'Oklahoma' },
	{ code: 'OR', name: 'Oregon' },
	{ code: 'PA', name: 'Pennsylvania' },
	{ code: 'RI', name: 'Rhode Island' },
	{ code: 'SC', name: 'South Carolina' },
	{ code: 'SD', name: 'South Dakota' },
	{ code: 'TN', name: 'Tennessee' },
	{ code: 'TX', name: 'Texas' },
	{ code: 'UT', name: 'Utah' },
	{ code: 'VT', name: 'Vermont' },
	{ code: 'VA', name: 'Virginia' },
	{ code: 'WA', name: 'Washington' },
	{ code: 'WV', name: 'West Virginia' },
	{ code: 'WI', name: 'Wisconsin' },
	{ code: 'WY', name: 'Wyoming' },
]
