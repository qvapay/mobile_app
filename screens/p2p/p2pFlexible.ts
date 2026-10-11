/**
 * Reglas PURAS de las ofertas P2P por rango (`offer_kind = 'flexible'`) del lado
 * de la app. Espejo de `scripts/p2p/flexible-rules.js` de qpweb: el servidor
 * valida igual, esto solo evita mandar al usuario contra un 4xx.
 *
 * La pieza central es `projectOrder`: una orden de una oferta por rango se pinta
 * como si fuera una oferta fixed (status/montos/tx_id/ventana de la orden y el
 * Taker como `Peer`). Así el trade room de siempre (progreso, confirmaciones,
 * timer, contraparte) sirve sin conocer las órdenes; lo único propio de una orden
 * —cancelar vs abrir disputa, confirmar en revisión— lo decide `orderCancelKind`.
 *
 * Todo el dinero se razona en CENTAVOS enteros, como en el backend.
 * Sin react-native: se testea con `@jest-environment node`.
 */

import type { P2POffer, P2POrder, P2POrderStatus, P2PStatus } from '../../types/domain'

export const ACTIVE_ORDER_STATUSES: P2POrderStatus[] = ['processing', 'paid', 'revision']

export const toCents = (value: unknown): number => {
	const n = Number(value)
	return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const fromCents = (cents: number): number => Math.round(cents) / 100

/** "12.5" → "12.50": los montos de dinero siempre con dos decimales. */
export const formatCents = (cents: number): string => fromCents(cents).toFixed(2)

export const isFlexibleOffer = (offer: Pick<P2POffer, 'offer_kind'> | null | undefined): boolean => offer?.offer_kind === 'flexible'

export const isActiveOrder = (order: Pick<P2POrder, 'status'> | null | undefined): boolean =>
	!!order && ACTIVE_ORDER_STATUSES.includes(order.status)

/** Lo que de verdad se puede tomar: el disponible en una por rango, el total en una fixed. */
export const offerAvailableCents = (offer: P2POffer): number =>
	isFlexibleOffer(offer) ? toCents(offer.available_amount) : toCents(offer.amount)

/** Tasa de la oferta (`receive / amount`), la misma para cada parte; null sin total. */
export const offerRate = (offer: Pick<P2POffer, 'amount' | 'receive'>): number | null => {
	const amount = Number(offer.amount)
	return amount > 0 ? Number(offer.receive) / amount : null
}

/** Contrapartida de un monto a la tasa de la oferta. */
export const quoteReceive = (amount: number, offer: Pick<P2POffer, 'amount' | 'receive'>): number => {
	const rate = offerRate(offer)
	return rate == null ? 0 : amount * rate
}

/** Límites de una parte: [mínimo, min(máximo, disponible)], en centavos. */
export const takeBounds = (offer: P2POffer): { minCents: number, maxCents: number } => ({
	minCents: toCents(offer.order_min),
	maxCents: Math.min(toCents(offer.order_max), offerAvailableCents(offer)),
})

export type TakeAmountCheck =
	| { ok: true, cents: number, amount: number }
	| { ok: false, reason: 'empty' | 'invalid' | 'belowMin' | 'aboveMax' | 'insufficientBalance' }

/**
 * Valida el monto tecleado para tomar una parte (calco de `applyAmountDecision`).
 * En una oferta `buy` el taker VENDE QUSD: el monto sale de su saldo como
 * garantía, así que se comprueba contra `balance` (en una `sell` no se pasa).
 */
export const checkTakeAmount = (text: string, offer: P2POffer, balance?: number | null): TakeAmountCheck => {
	const raw = String(text || '').replace(',', '.').trim()
	if (!raw) return { ok: false, reason: 'empty' }
	const n = Number(raw)
	if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: 'invalid' }
	const cents = Math.round(n * 100)
	if (Math.abs(n * 100 - cents) > 1e-6) return { ok: false, reason: 'invalid' }
	const { minCents, maxCents } = takeBounds(offer)
	if (cents < minCents) return { ok: false, reason: 'belowMin' }
	if (cents > maxCents) return { ok: false, reason: 'aboveMax' }
	if (offer.type === 'buy' && balance != null && cents > toCents(balance)) return { ok: false, reason: 'insufficientBalance' }
	return { ok: true, cents, amount: fromCents(cents) }
}

/** La orden viva del usuario en la oferta (el backend permite UNA por oferta y taker). */
export const findActiveOrder = (orders: P2POrder[] | null | undefined): P2POrder | null =>
	(orders || []).find(isActiveOrder) || null

export const findOrder = (offer: P2POffer | null | undefined, uuid: string | null | undefined): P2POrder | null =>
	(uuid && offer?.Orders?.find(o => o.uuid === uuid)) || null

/**
 * Proyecta una orden sobre su oferta madre con la forma de una oferta fixed:
 * `User` sigue siendo el dueño (maker) y `Peer` pasa a ser el Taker de la orden.
 */
export const projectOrder = (offer: P2POffer, order: P2POrder): P2POffer => ({
	...offer,
	status: order.status as P2PStatus,
	amount: order.amount,
	receive: order.receive,
	tx_id: order.tx_id ?? null,
	payment_window_expires_at: order.payment_window_expires_at ?? null,
	Peer: order.Taker ?? null,
})

/**
 * Qué hace el botón de "salir" de una orden según quién la mira:
 *   - quien PAGA el fiat cancela en cualquier estado activo (la garantía vuelve a su dueño);
 *   - quien RECIBE el fiat no puede cancelar (el otro pudo pagar ya): abre DISPUTA,
 *     una sola vez — con la orden ya en `revision` no hay botón.
 * Roles: `sell` → paga el taker; `buy` → paga el dueño.
 */
export const orderCancelKind = ({ offerType, isOwner, status }: { offerType: P2POffer['type'], isOwner: boolean, status: P2POrderStatus | P2PStatus }): 'cancel' | 'dispute' | null => {
	if (!ACTIVE_ORDER_STATUSES.includes(status as P2POrderStatus)) return null
	const isPayer = offerType === 'buy' ? isOwner : !isOwner
	if (isPayer) return 'cancel'
	return status === 'revision' ? null : 'dispute'
}

// ---------------------------------------------------------------------------
// Maker: crear y editar
// ---------------------------------------------------------------------------

const twoDecimals = (v: number) => Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6
const has = (v: string | null | undefined) => v != null && String(v).trim() !== ''
const num = (v: string) => Number(String(v).replace(',', '.'))

export type RangeError = 'minInvalid' | 'maxInvalid' | 'minAboveMax' | 'maxAboveAmount'

/** Rango de una oferta nueva: `0 < order_min ≤ order_max ≤ amount`, con 2 decimales. */
export const checkCreateRange = (amount: number, minText: string, maxText: string): { ok: true, order_min: number, order_max: number } | { ok: false, reason: RangeError } => {
	const min = num(minText)
	const max = num(maxText)
	if (!has(minText) || !(min > 0) || !twoDecimals(min)) return { ok: false, reason: 'minInvalid' }
	if (!has(maxText) || !(max > 0) || !twoDecimals(max)) return { ok: false, reason: 'maxInvalid' }
	if (toCents(min) > toCents(max)) return { ok: false, reason: 'minAboveMax' }
	if (toCents(max) > toCents(amount)) return { ok: false, reason: 'maxAboveAmount' }
	return { ok: true, order_min: fromCents(toCents(min)), order_max: fromCents(toCents(max)) }
}

export type FlexibleEditInput = { available: string, receive: string, order_min: string, order_max: string }

export type FlexibleEditCheck =
	| { ok: true, payload: { available_amount: number, receive?: number, order_min: number, order_max: number }, escrowDeltaCents: number }
	| { ok: false, reason: 'availableInvalid' | 'receiveInvalid' | 'availableBelowMin' | 'nothingTaken' | 'insufficientBalance' | RangeError }

/**
 * Edición de una oferta por rango (calco de `editFlexibleDecision`): solo se
 * toca lo que QUEDA por tomar. Disponible 0 retira el resto sin cancelar la
 * oferta (útil con órdenes vivas, que impiden cancelarla entera). En una `sell`
 * la diferencia de disponible se descuenta (> 0) o devuelve (< 0) del saldo:
 * `escrowDeltaCents` es lo que la UI enseña antes de guardar.
 */
export const checkFlexibleEdit = (offer: P2POffer, input: FlexibleEditInput, balance?: number | null): FlexibleEditCheck => {
	const oldAvailCents = toCents(offer.available_amount)
	const takenCents = toCents(offer.amount) - oldAvailCents

	let availCents = oldAvailCents
	if (has(input.available)) {
		const v = num(input.available)
		if (!Number.isFinite(v) || v < 0 || !twoDecimals(v)) return { ok: false, reason: 'availableInvalid' }
		availCents = Math.round(v * 100)
	}

	const min = has(input.order_min) ? num(input.order_min) : fromCents(toCents(offer.order_min))
	const max = has(input.order_max) ? num(input.order_max) : fromCents(toCents(offer.order_max))
	if (!(min > 0) || !twoDecimals(min)) return { ok: false, reason: 'minInvalid' }
	if (!(max > 0) || !twoDecimals(max)) return { ok: false, reason: 'maxInvalid' }
	if (toCents(min) > toCents(max)) return { ok: false, reason: 'minAboveMax' }
	if (availCents > 0 && availCents < toCents(min)) return { ok: false, reason: 'availableBelowMin' }
	if (takenCents + availCents <= 0) return { ok: false, reason: 'nothingTaken' }

	// Con disponible 0 no hay tasa futura que fijar: el backend rechaza `receive`
	// ahí, así que se omite en vez de bloquear al usuario
	let receive: number | undefined
	if (availCents > 0 && has(input.receive)) {
		const v = num(input.receive)
		if (!(v > 0) || v > 10000000) return { ok: false, reason: 'receiveInvalid' }
		receive = v
	}

	const escrowDeltaCents = offer.type === 'sell' ? availCents - oldAvailCents : 0
	if (escrowDeltaCents > 0 && balance != null && escrowDeltaCents > toCents(balance)) return { ok: false, reason: 'insufficientBalance' }

	return {
		ok: true,
		payload: { available_amount: fromCents(availCents), ...(receive != null ? { receive } : {}), order_min: fromCents(toCents(min)), order_max: fromCents(toCents(max)) },
		escrowDeltaCents,
	}
}

/**
 * Lo que el maker recibe/envía hoy por el disponible: el formulario de edición
 * arranca con esto (no con `receive`, que es por el TOTAL original).
 */
export const availableReceive = (offer: P2POffer): number =>
	quoteReceive(fromCents(offerAvailableCents(offer)), offer)
