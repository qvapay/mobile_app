/**
 * Lógica pura de revalidación y checkout del carrito del marketplace.
 * Port de `qpweb/app/(dashboard)/cart/cart-client.js` +
 * `qpweb/components/market/ui.js#addressEligible`. Sin imports de React
 * Native: testeable con `@jest-environment node`.
 */

import { cartItemKey } from './cartCore'

/** Mensajes de línea no comprable (mismos códigos que la web). */
export const PROBLEM_LABELS = {
	gone: 'Ya no está disponible',
	soldout: 'Agotado',
	variant_required: 'El producto cambió: elige de nuevo sus opciones desde la ficha',
}

/**
 * Effective price of a selection: the variant inherits the product price
 * when it doesn't define its own.
 *
 * @param {Object} product - Product with `price`.
 * @param {Object|null} [variant] - Selected variant (optional `price`).
 * @returns {number} Effective unit price.
 */
export function effectivePrice(product, variant) {
	return Number(variant?.price ?? product?.price ?? 0)
}

/**
 * ¿La dirección es elegible para los destinos del producto?
 * `shipTo == null` = envía a todos lados; `{ CC: null }` = país entero;
 * `{ CC: [provincias] }` = solo esas provincias.
 *
 * @param {Object|null} addr - Address with `country` and `state`.
 * @param {Object|null} shipTo - Product `ship_to` map.
 * @returns {boolean} Whether the address can receive the product.
 */
export function addressEligible(addr, shipTo) {
	if (shipTo == null) return true
	const cc = String(addr?.country || '').toUpperCase()
	if (!Object.prototype.hasOwnProperty.call(shipTo, cc)) return false
	const provs = shipTo[cc]
	if (provs == null) return true
	if (!Array.isArray(provs)) return false
	const st = String(addr?.state || '').toUpperCase()
	return provs.some((p) => String(p).toUpperCase() === st)
}

/**
 * Enriches cart items with fresh catalog state: problem detection, fresh
 * unit price, stock cap and shipping eligibility.
 *
 * @param {Object[]} items - Raw cart items (snapshots).
 * @param {Object|null} freshMap - `{ [product_uuid]: freshProduct }` from the batch endpoint, or null while revalidating (no problems are flagged then).
 * @param {Object|null} selectedAddress - Chosen shipping address (or null).
 * @param {Object} [statuses] - `{ [key]: 'paying' | 'done' | { error } }` per-line checkout state.
 * @returns {Object[]} Entries `{ item, key, fresh, problem, variant, unitPrice, maxQty, qty, isPhysical, shipBlocked, status }`.
 */
export function enrichCartItems(items, freshMap, selectedAddress, statuses = {}) {
	return items.map((item) => {
		const key = cartItemKey(item)
		const fresh = freshMap?.[item.product_uuid] || null
		let problem = null
		let variant = null
		let unitPrice = Number(item.price) || 0
		let maxQty = 999

		if (freshMap) {
			if (!fresh || !fresh.active || !fresh.shop?.active) problem = 'gone'
			else {
				if (item.variant_uuid) {
					variant = (fresh.variants || []).find((v) => v.uuid === item.variant_uuid) || null
					if (!variant) problem = 'gone'
					else unitPrice = Number(variant.price)
				} else {
					// El producto ganó variantes después de agregarse al carrito.
					if ((fresh.option_axes?.length || 0) > 0 && (fresh.variants?.length || 0) > 0) problem = 'variant_required'
					unitPrice = Number(fresh.price)
				}
				if (!problem) {
					maxQty = !fresh.track_inventory ? 999 : (item.variant_uuid ? (variant.stock == null ? 999 : variant.stock) : (fresh.stock ?? 0))
					if (maxQty <= 0) problem = 'soldout'
				}
			}
		}

		const qty = Math.max(1, Math.min(Number(item.qty) || 1, problem ? 999 : maxQty))
		const isPhysical = (fresh?.kind || item.kind) === 'physical'
		const shipTo = fresh ? fresh.ship_to : undefined
		// Elegibilidad geográfica solo evaluable con datos frescos y dirección elegida.
		const shipBlocked = !problem && isPhysical && !!selectedAddress && shipTo !== undefined && !addressEligible(selectedAddress, shipTo)

		return { item, key, fresh, problem, variant, unitPrice, maxQty, qty, isPhysical, shipBlocked, status: statuses[key] || null }
	})
}

/**
 * Groups enriched entries by shop for rendering, preferring fresh shop data
 * over the stored snapshot.
 *
 * @param {Object[]} entries - Output of `enrichCartItems`.
 * @returns {Object[]} Groups `{ name, slug, entries }` in first-seen order.
 */
export function groupByShop(entries) {
	const byShop = []
	for (const e of entries) {
		const name = e.fresh?.shop?.name || e.item.shop_name || 'Tienda'
		const slug = e.fresh?.shop?.slug || e.item.shop_slug || null
		let group = byShop.find((g) => g.name === name)
		if (!group) { group = { name, slug, entries: [] }; byShop.push(group) }
		group.entries.push(e)
	}
	return byShop
}

/**
 * Maps a failed order response to a human message. The backend speaks in
 * error codes for 409s and Spanish messages for the rest.
 *
 * @param {number|undefined} status - HTTP status of the failure.
 * @param {string|undefined} error - Backend `error` field.
 * @returns {string} Spanish message for the cart line.
 */
export function mapOrderError(status, error) {
	const code = String(error || '')
	if (code === 'OUT_OF_STOCK') return 'Se agotó mientras comprabas'
	if (code === 'PRODUCT_GONE') return 'Ya no está disponible'
	if (code === 'VARIANT_REQUIRED') return 'Elige de nuevo las opciones del producto'
	if (code === 'SHIP_TO_BLOCKED') return 'El vendedor no envía a tu dirección'
	if (code === 'DUPLICATE_REQUEST') return 'Compra duplicada: revisa tus compras'
	if (status === 429) return 'El servicio está ocupado. Intenta de nuevo en unos segundos.'
	return code || 'No pudimos procesar la compra'
}

/**
 * ¿El error corta el resto del checkout? Con saldo insuficiente las líneas
 * restantes fallarían igual: mejor abortar y dejarlas intactas.
 *
 * @param {string|undefined} error - Backend `error` field.
 * @returns {boolean} Whether the sequential loop should stop.
 */
export function isAbortingOrderError(error) {
	return /saldo insuficiente/i.test(String(error || ''))
}

/**
 * Idempotency key per cart line and screen session. No asumimos
 * `crypto.randomUUID` en Hermes: timestamp+random alcanza para des-duplicar.
 *
 * @returns {string} Key matching the backend's `[A-Za-z0-9._-]{8,64}` shape.
 */
export function makeIdemKey() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
