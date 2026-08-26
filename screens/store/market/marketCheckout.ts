/**
 * Lógica pura de revalidación y checkout del carrito del marketplace.
 * Port de `qpweb/app/(dashboard)/cart/cart-client.js` +
 * `qpweb/components/market/ui.js#addressEligible`. Sin imports de React
 * Native: testeable con `@jest-environment node`.
 */

import i18n from '../../../i18n'
import { cartItemKey } from './cartCore'
import type { CartItem, ShipTo } from './cartCore'

/** Variante fresca del catálogo (solo lo que lee el carrito). */
export type FreshVariant = {
	uuid?: string
	price?: number | string | null
	stock?: number | null
	image?: string | null
	options?: Record<string, string> | null
}

/**
 * Producto revalidado por `GET /shop/products?uuids=` — la fuente de verdad
 * previa al pago. Solo los campos que el carrito y el checkout leen.
 */
export type FreshProduct = {
	uuid?: string
	title?: string | null
	kind?: string | null
	price?: number | string | null
	main_image?: string | null
	active?: boolean
	track_inventory?: boolean | number | null
	stock?: number | null
	option_axes?: string[] | null
	variants?: FreshVariant[] | null
	ship_to?: ShipTo | null
	shop?: { slug?: string | null, name?: string | null, active?: boolean } | null
}

/** Dirección de envío evaluable (guardada o el formulario nuevo). */
export type ShippableAddress = { country?: string | null, state?: string | null }

/** Código de línea no comprable. */
export type CartProblem = keyof typeof PROBLEM_LABELS

/** Estado de checkout de una línea: en curso, hecha, o fallida con su mensaje. */
export type CartLineStatus = 'paying' | 'done' | { error: string } | null

/** Línea enriquecida con el estado fresco del catálogo. */
export type CartEntry = {
	item: CartItem
	key: string
	fresh: FreshProduct | null
	problem: CartProblem | null
	variant: FreshVariant | null
	unitPrice: number
	maxQty: number
	qty: number
	isPhysical: boolean
	shipBlocked: boolean
	status: CartLineStatus
}

/** Grupo de líneas de una misma tienda, en orden de primera aparición. */
export type ShopGroup = { name: string, slug: string | null, entries: CartEntry[] }

/**
 * Mensajes de línea no comprable (mismos códigos que la web). Los valores son
 * CLAVES de i18n: el render site las resuelve con `t(PROBLEM_LABELS[code])`.
 */
export const PROBLEM_LABELS: Record<'gone' | 'soldout' | 'variant_required', string> = {
	gone: 'market.checkout.problems.gone',
	soldout: 'market.common.soldOut',
	variant_required: 'market.checkout.problems.variantRequired',
}

/**
 * Effective price of a selection: the variant inherits the product price
 * when it doesn't define its own.
 *
 * @param product - Product with `price`.
 * @param variant - Selected variant (optional `price`).
 * @returns Effective unit price.
 */
export function effectivePrice(product: { price?: number | string | null } | null | undefined, variant?: { price?: number | string | null } | null): number {
	return Number(variant?.price ?? product?.price ?? 0)
}

/**
 * ¿La dirección es elegible para los destinos del producto?
 * `shipTo == null` = envía a todos lados; `{ CC: null }` = país entero;
 * `{ CC: [provincias] }` = solo esas provincias.
 *
 * @param addr - Address with `country` and `state`.
 * @param shipTo - Product `ship_to` map.
 * @returns Whether the address can receive the product.
 */
export function addressEligible(addr: ShippableAddress | null | undefined, shipTo: ShipTo | null | undefined): boolean {
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
 * @param items - Raw cart items (snapshots).
 * @param freshMap - `{ [product_uuid]: freshProduct }` from the batch endpoint, or null while revalidating (no problems are flagged then).
 * @param selectedAddress - Chosen shipping address (or null).
 * @param statuses - `{ [key]: 'paying' | 'done' | { error } }` per-line checkout state.
 * @returns Entries `{ item, key, fresh, problem, variant, unitPrice, maxQty, qty, isPhysical, shipBlocked, status }`.
 */
export function enrichCartItems(
	items: CartItem[],
	freshMap: Record<string, FreshProduct> | null | undefined,
	selectedAddress: ShippableAddress | null | undefined,
	statuses: Record<string, CartLineStatus> = {},
): CartEntry[] {
	return items.map((item) => {
		const key = cartItemKey(item)
		const fresh = freshMap?.[item.product_uuid] || null
		let problem: CartProblem | null = null
		let variant: FreshVariant | null = null
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
					// En esta rama `problem` es null, así que con variant_uuid la
					// variante SIEMPRE se resolvió arriba (si no, sería 'gone')
					maxQty = !fresh.track_inventory ? 999 : (item.variant_uuid ? (variant!.stock == null ? 999 : variant!.stock) : (fresh.stock ?? 0))
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
 * @param entries - Output of `enrichCartItems`.
 * @returns Groups `{ name, slug, entries }` in first-seen order.
 */
export function groupByShop(entries: CartEntry[]): ShopGroup[] {
	const byShop: ShopGroup[] = []
	for (const e of entries) {
		const name = e.fresh?.shop?.name || e.item.shop_name || i18n.t('market.common.storeFallback')
		const slug = e.fresh?.shop?.slug || e.item.shop_slug || null
		let group = byShop.find((g) => g.name === name)
		if (!group) { group = { name, slug, entries: [] }; byShop.push(group) }
		group.entries.push(e)
	}
	return byShop
}

/**
 * Maps a failed order response to a human message. The backend speaks in
 * error codes for 409s and Spanish messages for the rest (those pass through
 * verbatim; only local fallbacks are localized, via `i18n.t` at call time).
 *
 * @param status - HTTP status of the failure.
 * @param error - Backend `error` field.
 * @returns Localized message for the cart line.
 */
export function mapOrderError(status: number | undefined, error: string | undefined): string {
	const code = String(error || '')
	if (code === 'OUT_OF_STOCK') return i18n.t('market.checkout.errors.outOfStock')
	if (code === 'PRODUCT_GONE') return i18n.t('market.checkout.problems.gone')
	if (code === 'VARIANT_REQUIRED') return i18n.t('market.checkout.errors.variantRequired')
	if (code === 'SHIP_TO_BLOCKED') return i18n.t('market.checkout.errors.shipToBlocked')
	if (code === 'DUPLICATE_REQUEST') return i18n.t('market.checkout.errors.duplicate')
	if (status === 429) return i18n.t('market.checkout.errors.busy')
	return code || i18n.t('market.checkout.errors.generic')
}

/**
 * ¿El error corta el resto del checkout? Con saldo insuficiente las líneas
 * restantes fallarían igual: mejor abortar y dejarlas intactas.
 *
 * @param error - Backend `error` field.
 * @returns Whether the sequential loop should stop.
 */
export function isAbortingOrderError(error: string | undefined): boolean {
	return /saldo insuficiente/i.test(String(error || ''))
}

/**
 * Idempotency key per cart line and screen session. No asumimos
 * `crypto.randomUUID` en Hermes: timestamp+random alcanza para des-duplicar.
 *
 * @returns Key matching the backend's `[A-Za-z0-9._-]{8,64}` shape.
 */
export function makeIdemKey(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
