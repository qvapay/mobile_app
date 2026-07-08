/**
 * Shared constants for the assisted-shopping (Personal Shopper) flow.
 * Store availability and fees mirror the backend provider registry
 * (qpweb scripts/providers/shop/index.js) — the backend is the source of
 * truth; this list only drives the marketing UI on the landing screen.
 */

// Stores shown on the landing. `available` = purchasable today; the rest are
// "Pronto". `icon` is a FontAwesome6 brand glyph when one exists.
export const STORES = [
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
const PROVIDER_LABELS = {
	amazon: 'Amazon',
	ebay: 'eBay',
	walmart: 'Walmart',
	bestbuy: 'Best Buy',
	temu: 'TEMU',
	aliexpress: 'AliExpress',
	shein: 'SHEIN',
}
export const providerLabel = (provider) => PROVIDER_LABELS[provider] || provider || ''

/**
 * Order status metadata. Status comes derived from the backend Cart booleans:
 * paid → Confirmado, purchased → En camino, delivered → Entregado, cancelled.
 * `color` is a theme.colors key.
 */
export const ORDER_STATUS = {
	paid: { label: 'Confirmado', color: 'success' },
	purchased: { label: 'En camino', color: 'warning' },
	delivered: { label: 'Entregado', color: 'primary' },
	cancelled: { label: 'Cancelado', color: 'danger' },
	pending: { label: 'Pendiente', color: 'secondaryText' },
}

// USD helper used across the assisted screens.
export const money = (value) => `$${Number(value || 0).toFixed(2)}`

/**
 * Derives the QvaPay fee percent from the stored prices (same trick the web
 * ProductView uses): qp_price already includes the provider commission.
 *
 * @returns {number} Rounded percent (0 when there is no markup).
 */
export const feePercent = (price, qpPrice) => {
	const p = Number(price)
	const qp = Number(qpPrice)
	if (!p || !qp || qp <= p) return 0
	return Math.round(((qp / p) - 1) * 100)
}

// US states accepted by the backend (US_STATES in qpweb scripts/shop/us-state-tax.js).
export const US_STATES = [
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
