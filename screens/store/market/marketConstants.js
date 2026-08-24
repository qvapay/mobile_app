/**
 * Constantes del marketplace de tiendas (comercios aprobados).
 *
 * Espejo cliente de `qpweb/scripts/marketplace/validation.js` (categorías y
 * redes) y `qpweb/components/market/ui.js` (labels y socialHref). Módulo puro
 * sin imports de React Native: testeable con `@jest-environment node`. Los
 * labels visibles son CLAVES de i18n que el render site resuelve con `t()`.
 */

import i18n from '../../../i18n'

/** Categorías de tienda (slug → clave i18n), 1:1 con SHOP_CATEGORIES del backend. */
export const MARKET_CATEGORIES = {
	electronics: 'market.categories.electronics',
	fashion: 'market.categories.fashion',
	home: 'market.categories.home',
	beauty: 'market.categories.beauty',
	food: 'market.categories.food',
	sports: 'market.categories.sports',
	gaming: 'market.categories.gaming',
	books: 'market.categories.books',
	digital: 'market.categories.digital',
	services: 'market.categories.services',
	other: 'market.categories.other',
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
 * Icono FontAwesome6 y color de marca por red (mismo lenguaje que los botones
 * sociales de Settings/Referidos). `color: null` = usar un color del theme
 * (X en negro y el globo del sitio web no funcionan en dark mode).
 */
export const MARKET_SOCIAL_ICONS = {
	telegram: { icon: 'telegram', iconStyle: 'brand', color: '#26A5E4' },
	whatsapp: { icon: 'whatsapp', iconStyle: 'brand', color: '#25D366' },
	instagram: { icon: 'instagram', iconStyle: 'brand', color: '#E4405F' },
	facebook: { icon: 'facebook', iconStyle: 'brand', color: '#1877F2' },
	x: { icon: 'x-twitter', iconStyle: 'brand', color: null },
	web: { icon: 'globe', iconStyle: 'solid', color: null },
}

/**
 * Estados de una orden del marketplace (market_order_status del backend).
 * `label` es una clave de i18n (resuelta con `t()` en el render site) y
 * `color` una clave del theme (`theme.colors[color]`).
 */
export const MARKET_ORDER_STATUS = {
	paid: { label: 'common.status.paid', color: 'primary' },
	fulfilled: { label: 'market.orderStatus.fulfilled', color: 'success' },
	cancelled: { label: 'common.status.cancelled', color: 'danger' },
	refunded: { label: 'market.orderStatus.refunded', color: 'placeholder' },
}

/** Tipo de producto (market_product_kind del backend, valor → clave i18n). */
export const KIND_LABELS = { physical: 'market.kinds.physical', digital: 'market.kinds.digital', service: 'market.kinds.service', giftcard: 'market.kinds.giftcard' }

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
 * Nombre de país en el idioma ACTIVO de i18next desde el código ISO-2. El
 * Intl.DisplayNames se construye perezosamente por idioma (call time, nunca a
 * nivel de módulo: el idioma puede cambiar en runtime).
 *
 * @param {string} iso2 - Two-letter country code.
 * @returns {string} Localized country name, or the code as fallback.
 */
let regionNames = null
let regionNamesLang = null
export function countryName(iso2) {
	const code = String(iso2 || '').toUpperCase()
	if (!/^[A-Z]{2}$/.test(code)) return code
	const lang = i18n.language === 'en' ? 'en' : 'es'
	if (!regionNames || regionNamesLang !== lang) {
		try { regionNames = new Intl.DisplayNames([lang], { type: 'region' }) } catch { regionNames = null }
		regionNamesLang = lang
	}
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
