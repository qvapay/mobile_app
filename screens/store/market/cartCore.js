/**
 * Lógica pura del carrito del marketplace. Sin imports de React Native:
 * testeable con `@jest-environment node`. El estado (array de ítems) es
 * inmutable — cada mutador devuelve un array nuevo.
 *
 * Shape de ítem (espejo de `qpweb/hooks/use-market-cart.js`):
 * `{ product_uuid, variant_uuid?, qty, title, image, price, kind,
 *    shop_slug, shop_name, variant_label?, ship_to?, added_at }`
 * Los precios/imágenes guardados son snapshot de display: el backend
 * recalcula precio y stock al crear cada orden.
 */

export const MAX_ITEMS = 30
export const MAX_QTY = 999

/**
 * Cart line identity: a product without variant and each of its variants are
 * distinct lines.
 *
 * @param {Object} item - Cart item (needs `product_uuid`, optional `variant_uuid`).
 * @returns {string} Stable line key.
 */
export const cartItemKey = (item) => `${item.product_uuid}:${item.variant_uuid || ''}`

const clampQty = (qty) => Math.max(1, Math.min(MAX_QTY, Number(qty) || 1))

/**
 * Adds an item, merging quantities when the same product+variant already
 * exists. New lines beyond MAX_ITEMS are rejected.
 *
 * @param {Object[]} items - Current cart.
 * @param {Object} item - Item to add (snapshot fields + qty).
 * @param {number} [now] - Timestamp for `added_at` (injectable for tests).
 * @returns {{ items: Object[], added: boolean }} New array and whether it was accepted.
 */
export function addItem(items, item, now = Date.now()) {
	const key = cartItemKey(item)
	const existing = items.find((i) => cartItemKey(i) === key)
	if (existing) {
		const next = items.map((i) => (cartItemKey(i) === key
			? { ...i, ...item, qty: Math.min(MAX_QTY, (Number(i.qty) || 1) + (Number(item.qty) || 1)) }
			: i))
		return { items: next, added: true }
	}
	if (items.length >= MAX_ITEMS) return { items, added: false }
	return { items: [...items, { ...item, qty: clampQty(item.qty), added_at: now }], added: true }
}

/**
 * Removes the line matching a key.
 *
 * @param {Object[]} items - Current cart.
 * @param {string} key - Line key from `cartItemKey`.
 * @returns {Object[]} New array without the line.
 */
export function removeItem(items, key) {
	return items.filter((i) => cartItemKey(i) !== key)
}

/**
 * Sets a line's quantity, clamped to 1..MAX_QTY.
 *
 * @param {Object[]} items - Current cart.
 * @param {string} key - Line key from `cartItemKey`.
 * @param {number} qty - Desired quantity.
 * @returns {Object[]} New array with the updated line.
 */
export function setItemQty(items, key, qty) {
	const value = clampQty(qty)
	return items.map((i) => (cartItemKey(i) === key ? { ...i, qty: value } : i))
}

/**
 * Total units across lines (for the cart badge).
 *
 * @param {Object[]} items - Current cart.
 * @returns {number} Sum of quantities.
 */
export function cartCount(items) {
	return items.reduce((n, i) => n + (Number(i.qty) || 1), 0)
}

/**
 * Defensive parse of the persisted cart payload.
 *
 * @param {string|null} raw - Raw JSON from storage.
 * @returns {Object[]} Valid items only (never throws).
 */
export function parseStoredItems(raw) {
	if (!raw) return []
	let parsed = []
	try { parsed = JSON.parse(raw) } catch { return [] }
	return Array.isArray(parsed) ? parsed.filter((i) => i && i.product_uuid) : []
}
