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

/** Destinos de envío de un producto: `{ CC: null | [provincias] }`; `null` = envía a todos lados. */
export type ShipTo = Record<string, string[] | null | undefined>

/**
 * Línea del carrito tal y como se persiste: snapshot de display del catálogo
 * público. Solo los campos que leen el carrito, el checkout y las pantallas
 * (el backend recalcula precio y stock al crear cada orden).
 */
export type CartItem = {
	product_uuid: string
	variant_uuid?: string | null
	qty?: number | string
	title?: string | null
	image?: string | null
	price?: number | string | null
	kind?: string | null
	shop_slug?: string | null
	shop_name?: string | null
	variant_label?: string
	ship_to?: ShipTo | null
	added_at?: number
}

/**
 * Cart line identity: a product without variant and each of its variants are
 * distinct lines.
 *
 * @param item - Cart item (needs `product_uuid`, optional `variant_uuid`).
 * @returns Stable line key.
 */
export const cartItemKey = (item: Pick<CartItem, 'product_uuid' | 'variant_uuid'>): string => `${item.product_uuid}:${item.variant_uuid || ''}`

const clampQty = (qty: number | string | null | undefined): number => Math.max(1, Math.min(MAX_QTY, Number(qty) || 1))

/**
 * Adds an item, merging quantities when the same product+variant already
 * exists. New lines beyond MAX_ITEMS are rejected.
 *
 * @param items - Current cart.
 * @param item - Item to add (snapshot fields + qty).
 * @param now - Timestamp for `added_at` (injectable for tests).
 * @returns New array and whether it was accepted.
 */
export function addItem(items: CartItem[], item: CartItem, now: number = Date.now()): { items: CartItem[], added: boolean } {
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
 * @param items - Current cart.
 * @param key - Line key from `cartItemKey`.
 * @returns New array without the line.
 */
export function removeItem(items: CartItem[], key: string): CartItem[] {
	return items.filter((i) => cartItemKey(i) !== key)
}

/**
 * Sets a line's quantity, clamped to 1..MAX_QTY.
 *
 * @param items - Current cart.
 * @param key - Line key from `cartItemKey`.
 * @param qty - Desired quantity.
 * @returns New array with the updated line.
 */
export function setItemQty(items: CartItem[], key: string, qty: number): CartItem[] {
	const value = clampQty(qty)
	return items.map((i) => (cartItemKey(i) === key ? { ...i, qty: value } : i))
}

/**
 * Total units across lines (for the cart badge).
 *
 * @param items - Current cart.
 * @returns Sum of quantities.
 */
export function cartCount(items: CartItem[]): number {
	return items.reduce((n, i) => n + (Number(i.qty) || 1), 0)
}

/**
 * Defensive parse of the persisted cart payload.
 *
 * @param raw - Raw JSON from storage.
 * @returns Valid items only (never throws).
 */
export function parseStoredItems(raw: string | null | undefined): CartItem[] {
	if (!raw) return []
	// El payload de disco es JSON arbitrario: se valida por `product_uuid` y se
	// asume la forma de línea (mismo contrato que escribe `persist`)
	let parsed: unknown = []
	try { parsed = JSON.parse(raw) } catch { return [] }
	return Array.isArray(parsed) ? (parsed as CartItem[]).filter((i) => i && i.product_uuid) : []
}
