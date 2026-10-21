/**
 * Reglas PURAS del puesto promocionado del mercado P2P del lado de la app: qué se pinta
 * arriba del listado, qué se cobra y cuándo se puede comprar o pujar. Espejo de
 * `scripts/p2p/promo-rules.js` y `app/api/p2p/promo/route.js` de qpweb (guía en
 * `content/docs/p2p/promo.mdx`): el servidor decide igual, esto solo evita mandar al
 * usuario contra un 4xx.
 *
 * Un puesto por moneda y TIPO de oferta: `sell` sale en la pestaña Comprar (promociona
 * ofertas de venta de QUSD) y `buy` en Vender. Libre ⇒ se compra al precio de salida y es
 * del comprador un periodo; ocupado ⇒ se puja por el periodo siguiente (la puja se cobra y
 * queda retenida; si alguien la supera se devuelve entera).
 *
 * Sin react-native: se testea con `@jest-environment node`.
 */

import type { P2POffer, P2PPromoOfferType, P2PPromoPayload, P2PPromoSlot, P2PPromoted } from '../../types/domain'

export const PROMO_OFFER_TYPES: readonly P2PPromoOfferType[] = ['sell', 'buy']

/** `type` de una ruta/push/deep link, solo si es uno de los dos lados. */
export const promoTypeOf = (value: unknown): P2PPromoOfferType | undefined =>
	(PROMO_OFFER_TYPES as readonly unknown[]).includes(value) ? value as P2PPromoOfferType : undefined

/**
 * El listado sin la oferta promocionada: `GET /p2p/index` la manda en `data` Y en
 * `promoted`, y como ya va arriba en su tarjeta no se repite en su posición del ranking.
 */
export const withoutPromoted = (offers: P2POffer[], promoted: P2PPromoted | null | undefined): P2POffer[] => {
	const uuid = promoted?.offer?.uuid
	return uuid ? offers.filter(offer => offer.uuid !== uuid) : offers
}

/** Puesto de un lado (null con la función apagada o sin datos). */
export const slotFor = (payload: P2PPromoPayload | null | undefined, type: P2PPromoOfferType): P2PPromoSlot | null =>
	payload?.enabled ? payload.slots.find(slot => slot.offer_type === type) ?? null : null

/** Puesto LIBRE de ese lado, para anunciarlo sobre el mercado. */
export const freeSlotFor = (payload: P2PPromoPayload | null | undefined, type: P2PPromoOfferType): P2PPromoSlot | null => {
	const slot = slotFor(payload, type)
	return slot?.state === 'free' ? slot : null
}

/** Cómo está el puesto para quien lo mira: el titular se compara por uuid. */
export type SlotStatus = 'free' | 'rotating' | 'mine' | 'taken'

export const slotStatus = (slot: P2PPromoSlot, userUuid: string | null | undefined): SlotStatus => {
	if (slot.state === 'free') return 'free'
	if (slot.state === 'rotating') return 'rotating'
	return userUuid && slot.holder?.uuid === userUuid ? 'mine' : 'taken'
}

/** Puja tecleada en USD, a centavos (acepta coma decimal). NaN si no es un número. */
export const parseBid = (text: string | null | undefined): number => {
	const value = Number(String(text ?? '').trim().replace(',', '.'))
	return Number.isFinite(value) && String(text ?? '').trim() !== '' ? Math.round(value * 100) / 100 : NaN
}

/** Lo que se cobra: el precio de salida en un puesto libre (el servidor exige ese importe exacto); la puja en uno ocupado. */
export const promoPrice = (slot: P2PPromoSlot, bidText: string | null | undefined): number =>
	slot.state === 'free' ? Number(slot.start_price) : parseBid(bidText)

/**
 * Por qué NO se puede comprar o pujar ahora (null = adelante):
 * - `rotating`: el periodo acaba de vencer y se está asignando.
 * - `ineligible`: sin P2P activo o sin la reputación mínima.
 * - `leading`: ya tengo la puja más alta (el servidor respondería ALREADY_LEADING).
 * - `invalidBid`: puja vacía o por debajo de `min_bid`.
 * - `balance`: no me alcanza el saldo.
 */
export type PromoBlock = 'rotating' | 'ineligible' | 'leading' | 'invalidBid' | 'balance' | null

export const promoBlock = ({ slot, bidText, balance, eligible, leadingMine }: {
	slot: P2PPromoSlot
	bidText: string | null | undefined
	balance: number | string | null | undefined
	eligible: boolean
	leadingMine: boolean
}): PromoBlock => {
	if (slot.state === 'rotating') return 'rotating'
	if (!eligible) return 'ineligible'
	if (slot.state !== 'free' && leadingMine) return 'leading'
	const price = promoPrice(slot, bidText)
	if (!(price > 0) || (slot.state !== 'free' && price < Number(slot.min_bid))) return 'invalidBid'
	if (price > (Number(balance) || 0)) return 'balance'
	return null
}

/** ¿Quien llama puede comprar o pujar? P2P activo (KYC incluido) y la reputación que pide el servidor. */
export const promoEligible = (
	user: { kyc?: unknown, p2p_enabled?: unknown } | null | undefined,
	payload: P2PPromoPayload | null | undefined,
): boolean => !!user?.kyc && !!user?.p2p_enabled && payload?.eligibility?.ok !== false

export type PromoErrorKind = 'priceChanged' | 'alreadyLeading' | 'balance' | 'requirements' | 'p2pDisabled' | 'tooHigh' | 'retry' | 'rateLimited' | 'disabled' | 'generic'

/**
 * Qué hacer con un fallo de `POST /p2p/promo`. Los errores de negocio traen `code` y el
 * `slot` vigente (PROMO_PRICE_CHANGED, además, el nuevo `min`): con él se actualiza la
 * tarjeta sin esperar al refetch. Nunca se cobró nada.
 */
export const classifyPromoError = (res: { status?: number, details?: unknown }): { kind: PromoErrorKind, min: number | null, slot: P2PPromoSlot | null } => {
	const details = (res.details || {}) as { code?: string, min?: number, slot?: P2PPromoSlot | null }
	const kinds: Record<string, PromoErrorKind> = {
		PROMO_PRICE_CHANGED: 'priceChanged',
		ALREADY_LEADING: 'alreadyLeading',
		INSUFFICIENT_BALANCE: 'balance',
		PROMO_REQUIREMENTS_NOT_MET: 'requirements',
		P2P_NOT_ENABLED: 'p2pDisabled',
		BID_TOO_HIGH: 'tooHigh',
		PROMO_RETRY: 'retry',
		RATE_LIMITED: 'rateLimited',
		PROMO_DISABLED: 'disabled',
		PROMO_UNAVAILABLE: 'disabled',
	}
	const kind = (details.code && kinds[details.code]) || (res.status === 429 ? 'rateLimited' : 'generic')
	const min = Number(details.min)
	return { kind, min: Number.isFinite(min) && min > 0 ? min : null, slot: details.slot ?? null }
}

/**
 * Moneda con la que abre la pantalla: la que llega (push, deep link, mercado) si existe en
 * el catálogo P2P —o si el catálogo aún no cargó—, si no BANK_CUP como la web, si no la primera.
 */
export const defaultPromoCoin = (requested: string | null | undefined, ticks: string[]): string | null => {
	const wanted = String(requested || '').trim().toUpperCase()
	if (wanted && (!ticks.length || ticks.includes(wanted))) return wanted
	if (ticks.includes('BANK_CUP')) return 'BANK_CUP'
	return ticks[0] ?? null
}

/** Importe en USD sin decimales de sobra: 5 → "5", 27.5 → "27.50" (va tras un `$` en el copy). */
export const promoUsd = (value: number | string | null | undefined): string => {
	const n = Number(value) || 0
	return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
