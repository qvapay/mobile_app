/**
 * Constantes del marketplace de tiendas (comercios aprobados).
 *
 * Espejo cliente de `qpweb/scripts/marketplace/validation.js` (categorías y
 * redes) y `qpweb/components/market/ui.js` (labels y socialHref). Módulo puro
 * sin imports de React Native: testeable con `@jest-environment node`.
 */

/** Categorías de tienda (slug → label ES), 1:1 con SHOP_CATEGORIES del backend. */
export const MARKET_CATEGORIES = {
	electronics: 'Electrónica',
	fashion: 'Moda y accesorios',
	home: 'Hogar',
	beauty: 'Belleza y cuidado personal',
	food: 'Comida y bebidas',
	sports: 'Deportes',
	gaming: 'Gaming',
	books: 'Libros y educación',
	digital: 'Productos digitales',
	services: 'Servicios',
	other: 'Otro',
}

/** Emoji por categoría para pills y tiles. */
export const MARKET_CATEGORY_EMOJIS = {
	electronics: '📱',
	fashion: '👕',
	home: '🏠',
	beauty: '💄',
	food: '🍔',
	sports: '⚽',
	gaming: '🎮',
	books: '📚',
	digital: '💾',
	services: '🛠️',
	other: '🛍️',
}

/** Redes sociales soportadas en el perfil de una tienda (clave → label). */
export const MARKET_SOCIAL_NETWORKS = {
	telegram: 'Telegram',
	whatsapp: 'WhatsApp',
	instagram: 'Instagram',
	facebook: 'Facebook',
	x: 'X (Twitter)',
	web: 'Sitio web',
}

/**
 * Estados de una orden del marketplace (market_order_status del backend).
 * `color` es una clave del theme (`theme.colors[color]`).
 */
export const MARKET_ORDER_STATUS = {
	paid: { label: 'Pagada', color: 'primary' },
	fulfilled: { label: 'Entregada', color: 'success' },
	cancelled: { label: 'Cancelada', color: 'danger' },
	refunded: { label: 'Reembolsada', color: 'placeholder' },
}

/** Tipo de producto (market_product_kind del backend). */
export const KIND_LABELS = { physical: 'Físico', digital: 'Digital', service: 'Servicio', giftcard: 'Gift card' }

/**
 * Builds a clickable URL from a stored social value (handle, phone, bare
 * domain or full URL). Port of `qpweb/components/market/ui.js#socialHref`.
 *
 * @param {string} network - Key from MARKET_SOCIAL_NETWORKS.
 * @param {string} value - Stored value (may be a handle like `@shop`).
 * @returns {string|null} URL for `Linking.openURL`, or null when unlinkable.
 */
export function socialHref(network, value) {
	const v = String(value || '').trim()
	if (!v) return null
	if (/^https?:\/\//i.test(v)) return v
	// "facebook.com/mitienda" o "mitienda.com" sin protocolo
	if (/^[\w.-]+\.[a-z]{2,}([/?#]|$)/i.test(v)) return `https://${v}`
	const handle = v.replace(/^@/, '')
	switch (network) {
		case 'telegram': return `https://t.me/${handle}`
		case 'whatsapp': {
			const digits = v.replace(/[^0-9]/g, '')
			return digits.length >= 8 ? `https://wa.me/${digits}` : null
		}
		case 'instagram': return `https://instagram.com/${handle}`
		case 'facebook': return `https://facebook.com/${handle}`
		case 'x': return `https://x.com/${handle}`
		default: return null
	}
}

/**
 * "$10.00" o "$10.00 – $15.00" para productos con variantes.
 *
 * @param {number|null} min - Minimum effective price.
 * @param {number|null} [max] - Maximum effective price.
 * @returns {string} Human price or price range.
 */
export function formatPriceRange(min, max) {
	if (min == null) return ''
	if (max == null || Number(min) === Number(max)) return `$${Number(min).toFixed(2)}`
	return `$${Number(min).toFixed(2)} – $${Number(max).toFixed(2)}`
}

/**
 * Nombre de país en español desde el código ISO-2.
 *
 * @param {string} iso2 - Two-letter country code.
 * @returns {string} Localized country name, or the code as fallback.
 */
let regionNames = null
try { regionNames = new Intl.DisplayNames(['es'], { type: 'region' }) } catch { regionNames = null }
export function countryName(iso2) {
	const code = String(iso2 || '').toUpperCase()
	if (!/^[A-Z]{2}$/.test(code)) return code
	try { return regionNames?.of(code) || code } catch { return code }
}

/**
 * Resumen legible de destinos de envío: "Cuba (LHA, MTZ), Estados Unidos".
 *
 * @param {Object|null} shipTo - `{ CC: null | [provincias] }` o null (todos).
 * @returns {string|null} Summary line, or null when the product ships anywhere.
 */
export function shipToSummary(shipTo) {
	if (shipTo == null) return null
	return Object.entries(shipTo).map(([cc, provs]) => {
		if (provs == null || !provs.length) return countryName(cc)
		return `${countryName(cc)} (${provs.join(', ')})`
	}).join(', ')
}
