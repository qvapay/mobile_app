/**
 * Lógica pura de revalidación y checkout del carrito del marketplace.
 * Port de `qpweb/app/(dashboard)/cart/cart-client.js` +
 * `qpweb/components/market/ui.js#addressEligible`. Sin imports de React
 * Native: testeable con `@jest-environment node`.
 */

import i18n from '../../../i18n'
import { cartItemKey } from './cartCore'
import { mergeDeliveryMunicipalities, provinceName, supplierAddressIssue, supplierNeedsIdentification } from '../../../ui/store/cubaAddress'
import type { CartItem, ShipTo } from './cartCore'
import type { SupplierInfo } from '../../../ui/store/cubaAddress'

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
	/** `balance_only`: tienda de proveedor, solo se paga con saldo. */
	shop?: { slug?: string | null, name?: string | null, active?: boolean, balance_only?: boolean } | null
	/**
	 * Tienda cumplida por un proveedor: `ship_country` dice si entrega a domicilio en Cuba
	 * (municipio + carnet) o solo en EE. UU., y `delivery_municipalities` qué municipios cubre.
	 * Va DENTRO del producto, no en su raíz de envío (`ship_to`).
	 */
	supplier?: SupplierInfo | null
}

/** Dirección de envío evaluable (guardada o el formulario nuevo). */
export type ShippableAddress = { country?: string | null, state?: string | null, city?: string | null, identification?: string | null }

/** Dirección elegida en el carrito: una guardada, el formulario de una nueva o una cubana guardada que se está completando. */
export type ShippingChoice = { kind: 'saved', uuid: string } | { kind: 'new' } | { kind: 'edit', uuid: string }

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
	/** Por qué la dirección elegida no sirve para esta línea (null si sirve o no se puede evaluar). */
	shipReason: string | null
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
 * @returns Entries `{ item, key, fresh, problem, variant, unitPrice, maxQty, qty, isPhysical, shipBlocked, shipReason, status }`.
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
		// Elegibilidad geográfica solo evaluable con datos frescos y dirección elegida: el
		// `ship_to` del producto y, en una tienda de proveedor, municipio y carnet.
		const shipReason = !problem && isPhysical && !!selectedAddress && fresh ? shipIssue(fresh, selectedAddress) : null

		return { item, key, fresh, problem, variant, unitPrice, maxQty, qty, isPhysical, shipBlocked: !!shipReason, shipReason, status: statuses[key] || null }
	})
}

/**
 * País al que tiene que ir un producto, si solo admite uno: el de su proveedor (`'US'` o, si
 * no, Cuba) o el único país de su `ship_to`. null = varios países o cualquiera.
 *
 * @param fresh - Producto fresco.
 * @returns Código de país o null.
 */
export function requiredCountry(fresh: FreshProduct | null | undefined): string | null {
	if (!fresh) return null
	if (fresh.supplier) return supplierNeedsIdentification(fresh.supplier) ? 'CU' : 'US'
	const countries = fresh.ship_to ? Object.keys(fresh.ship_to) : []
	return countries.length === 1 ? countries[0].toUpperCase() : null
}

/**
 * Por qué una dirección no sirve para un producto físico (null = sirve). Primero el `ship_to`
 * (país y provincia) y luego las reglas de la tienda de proveedor (municipio cubierto y carnet,
 * o dirección en EE. UU.). Mensajes de i18n en call time.
 *
 * @param fresh - Producto fresco.
 * @param addr - Dirección elegida (guardada o el formulario).
 * @returns Mensaje para la línea, o null.
 */
export function shipIssue(fresh: FreshProduct, addr: ShippableAddress): string | null {
	if (!addressEligible(addr, fresh.ship_to)) {
		const only = requiredCountry(fresh)
		const country = String(addr?.country || '').toUpperCase()
		if (only === 'CU' && country !== 'CU') return i18n.t('market.cart.reasons.onlyCuba')
		if (only === 'US' && country !== 'US') return i18n.t('market.cart.reasons.onlyUs')
		// País admitido pero provincia o estado fuera de la lista
		if (country && fresh.ship_to && Object.prototype.hasOwnProperty.call(fresh.ship_to, country) && addr?.state) {
			return i18n.t('market.cart.reasons.region', { region: country === 'CU' ? provinceName(addr.state) : String(addr.state).toUpperCase() })
		}
		return i18n.t('market.cart.itemShipBlocked')
	}
	return supplierAddressIssue(fresh.supplier, addr)
}

/** Líneas físicas pagables con datos frescos: las únicas que deciden sobre la dirección. */
const physicalFresh = (entries: CartEntry[]): (CartEntry & { fresh: FreshProduct })[] =>
	entries.filter((e): e is CartEntry & { fresh: FreshProduct } => !e.problem && e.status !== 'done' && e.isPhysical && !!e.fresh)

/**
 * Por qué una dirección no sirve para el carrito: el motivo de la primera línea física que no
 * la acepta (null = sirve para todas). Lo usan el selector de direcciones guardadas y la
 * preselección.
 *
 * @param entries - Líneas enriquecidas (con o sin dirección).
 * @param addr - Dirección a evaluar.
 * @returns Mensaje o null.
 */
export function cartAddressIssue(entries: CartEntry[], addr: ShippableAddress | null | undefined): string | null {
	if (!addr) return null
	for (const e of physicalFresh(entries)) {
		const issue = shipIssue(e.fresh, addr)
		if (issue) return issue
	}
	return null
}

/**
 * Países que exigen las líneas físicas del carrito. Con más de uno (una tienda que entrega en
 * Cuba y otra que solo envía a EE. UU.) ninguna dirección sirve para todo el carrito.
 *
 * @param entries - Líneas enriquecidas.
 * @returns Países exigidos, sin repetir.
 */
export function requiredCountries(entries: CartEntry[]): string[] {
	const out: string[] = []
	for (const e of physicalFresh(entries)) {
		const cc = requiredCountry(e.fresh)
		if (cc && !out.includes(cc)) out.push(cc)
	}
	return out
}

/**
 * Provincias y municipios de Cuba que cubren TODAS las líneas físicas: lo que puede ofrecer el
 * formulario de una dirección cubana. null en cada campo = sin restricción (o no hay ninguno
 * común, y entonces lo dirá el motivo de cada línea).
 *
 * @param entries - Líneas enriquecidas.
 * @returns `{ provinces, municipalities }`.
 */
export function cartCubaCoverage(entries: CartEntry[]): { provinces: string[] | null, municipalities: Record<string, string[]> | null } {
	const lines = physicalFresh(entries)
	const merged = mergeDeliveryMunicipalities(lines.map(e => e.fresh.supplier?.delivery_municipalities))
	const municipalities = merged && Object.keys(merged).length > 0 ? merged : null
	let provinces: string[] | null = null
	for (const e of lines) {
		const list = e.fresh.ship_to?.CU
		if (!Array.isArray(list)) continue
		const codes = list.map(p => String(p).toUpperCase())
		provinces = provinces ? provinces.filter(p => codes.includes(p)) : codes
	}
	if (municipalities) {
		const covered = Object.keys(municipalities)
		provinces = provinces ? provinces.filter(p => covered.includes(p)) : covered
	}
	return { provinces: provinces && provinces.length > 0 ? provinces : null, municipalities }
}

/**
 * Dirección guardada que se elige sola mientras el usuario no toque nada: la predeterminada si
 * sirve, si no la primera que sirva; si ninguna sirve, la primera que se pueda completar (una
 * cubana sin carnet, por ejemplo) y, por último, la predeterminada o la primera.
 *
 * @param addresses - Direcciones guardadas.
 * @param issueFor - Motivo por el que una dirección no sirve (null = sirve).
 * @param completable - Si una dirección que no sirve se arregla completándola.
 * @returns La dirección, o null sin direcciones.
 */
export function pickShippingAddress<A extends { is_default?: boolean | number | null }>(
	addresses: A[],
	issueFor: (a: A) => string | null,
	completable: (a: A) => boolean = () => false,
): A | null {
	if (!addresses.length) return null
	const byDefault = [...addresses].sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default))
	return byDefault.find(a => !issueFor(a)) || byDefault.find(completable) || byDefault[0]
}

/**
 * Orden de pago: primero las líneas de tiendas que entregan en Cuba (las que pueden pedir la
 * atestación OFAC), así un `US_PERSON_ATTESTATION_REQUIRED` corta el recorrido antes de cobrar
 * nada más. Partición ESTABLE: dentro de cada tienda no cambia el orden (el proveedor es por
 * tienda), y el envío se sigue cobrando en la primera orden física de cada una.
 *
 * @param payable - Líneas a pagar.
 * @returns Las mismas líneas, reordenadas.
 */
export function paymentSequence(payable: CartEntry[]): CartEntry[] {
	const cuba = payable.filter(e => supplierNeedsIdentification(e.fresh?.supplier))
	return [...cuba, ...payable.filter(e => !cuba.includes(e))]
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
 * Maps a failed order response to a human message. Decides by the backend `code` (it travels
 * in `details.code`; `error` is the Spanish message) and falls back to the message, which
 * passes through verbatim. Only local fallbacks are localized, via `i18n.t` at call time.
 * `SHIP_TO_BLOCKED` and `IDENTIFICATION_REQUIRED` keep the server's text when it has one: it
 * names the municipality.
 *
 * @param status - HTTP status of the failure.
 * @param error - Backend `error` field (message).
 * @param code - Backend `code` (`details.code`).
 * @returns Localized message for the cart line.
 */
export function mapOrderError(status: number | undefined, error: string | undefined, code?: string | null): string {
	const message = String(error || '')
	switch (code) {
		case 'OUT_OF_STOCK': return i18n.t('market.checkout.errors.outOfStock')
		case 'PRODUCT_GONE': return i18n.t('market.checkout.problems.gone')
		case 'VARIANT_REQUIRED': return i18n.t('market.checkout.errors.variantRequired')
		case 'SHIP_TO_BLOCKED': return message || i18n.t('market.checkout.errors.shipToBlocked')
		case 'IDENTIFICATION_REQUIRED': return message || i18n.t('market.checkout.errors.identificationRequired')
		case 'SUPPLIER_PAUSED': return i18n.t('market.checkout.errors.supplierPaused')
		case 'US_PERSON_ATTESTATION_REQUIRED': return i18n.t('market.checkout.errors.attestationRequired')
		case 'DUPLICATE_REQUEST': return i18n.t('market.checkout.errors.duplicate')
		default: break
	}
	if (status === 429) return i18n.t('market.checkout.errors.busy')
	return message || i18n.t('market.checkout.errors.generic')
}

/** Código de error de una orden fallida (`details.code` del cuerpo de error). */
export const orderErrorCode = (details: unknown): string | null => {
	const code = (details as { code?: unknown } | null | undefined)?.code
	return typeof code === 'string' ? code : null
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

/** Máximo de líneas de un cobro externo (`MAX_ITEMS` de qpweb `checkout-batch.js`). */
export const PIX_CART_MAX_ITEMS = 20

/**
 * ¿Este carrito se puede pagar con PIX? Un pago reversible no compra gift cards, que emiten códigos
 * al instante, ni tiendas de proveedor, que se pagan al despachar.
 *
 * @param payable - Líneas pagables.
 */
export function isPixPayableCart(payable: CartEntry[]): boolean {
	if (payable.length === 0 || payable.length > PIX_CART_MAX_ITEMS) return false
	return !payable.some((e) => (e.fresh?.kind || e.item.kind) === 'giftcard' || !!e.fresh?.shop?.balance_only)
}

/**
 * Campos de `POST /pix/checkout` con `source: 'market'`: UN cobro por todo el carrito, al contrario
 * que el pago con saldo, y la dirección ya guardada.
 *
 * @param payable - Líneas a pagar.
 * @param addressUuid - Dirección de envío, si hay físicos.
 */
export function buildMarketPixBody(payable: CartEntry[], addressUuid: string | null) {
	return {
		items: payable.map((e) => ({
			product_uuid: e.item.product_uuid,
			...(e.item.variant_uuid ? { variant_uuid: e.item.variant_uuid } : {}),
			quantity: e.qty,
		})),
		...(addressUuid && payable.some((e) => e.isPhysical) ? { shipping_address_id: addressUuid } : {}),
	}
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
