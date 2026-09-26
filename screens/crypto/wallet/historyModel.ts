/**
 * El historial de intercambios tiene DOS orígenes y una sola lista.
 *
 * Los swaps con el saldo QvaPay (`/swap`) y las órdenes de proveedor (`/wallet/exchange`)
 * son motores distintos, con tablas, estados y pantallas de detalle propias. Para el
 * usuario son lo mismo: "cambié una cosa por otra". Este módulo los normaliza a una fila
 * común y los funde en orden cronológico.
 *
 * PURO (testeado en node): ni React, ni i18n, ni tema. Devuelve claves de traducción y
 * tonos, no texto ni colores.
 */

import { phaseOf } from './exchangeModel'
import type { ExchangePhase } from './exchangeModel'
import type { ExchangeOrder, Swap } from '../../../types/domain'

/** De dónde viene la fila: decide a qué pantalla de detalle lleva. */
export type HistoryKind = 'exchange' | 'swap'

/**
 * Un lado de la fila. Los dos motores identifican su activo de forma distinta y ninguno se
 * traduce al otro sin el catálogo: el agregador manda ya el `assetId` (red incluida), y el
 * swap solo el CONTRATO. Componer `stacks:<contrato>` a mano funcionaría hoy —el único par
 * publicado es QUSD en Stacks— y dejaría de funcionar en silencio el día que se publique un
 * par en otra red. La red la pone quien tiene el catálogo.
 */
export type HistorySide =
	| { kind: 'balance' }
	| { kind: 'asset', assetId: string }
	| { kind: 'token', contract: string }

export type HistoryEntry = {
	/** `kind:uuid` — los uuid son únicos por tabla, no entre tablas. */
	key: string
	kind: HistoryKind
	uuid: string
	from: HistorySide
	to: HistorySide
	/** Lo que sale, ya formateado por quien lo creó (string: los decimales son exactos). */
	amountIn: string
	/** Lo que entra; null cuando todavía no se sabe. */
	amountOut: string | null
	/** Clave i18n completa del estado. */
	statusKey: string
	phase: ExchangePhase
	/** ISO del backend. Solo para ordenar. */
	createdAt: string
}

const swapAssetSide = (swap: Swap): HistorySide => ({ kind: 'token', contract: swap.asset })

/**
 * Fase de un swap custodial en el MISMO vocabulario que el agregador, para que la lista
 * tenga un solo código de colores. `deposit`/`working` no se distinguen aquí: en el swap
 * custodial no hay nada que el usuario tenga que hacer, solo esperar.
 */
const SWAP_PHASE: Record<Swap['status'], ExchangePhase> = {
	pending: 'working',
	dispatching: 'working',
	sent: 'working',
	completed: 'done',
	refunded: 'returned',
	failed: 'problem',
	needs_review: 'problem',
}

/**
 * El importe de un swap es USD y el par es 1:1 sin comisión, así que los dos lados son el
 * mismo número. Se formatea a dos decimales porque es lo que el usuario tecleó.
 */
const swapAmount = (swap: Swap): string => swap.amount.toFixed(2)

export const entryFromSwap = (swap: Swap): HistoryEntry => {
	const balance: HistorySide = { kind: 'balance' }
	const asset = swapAssetSide(swap)
	return {
		key: `swap:${swap.uuid}`,
		kind: 'swap',
		uuid: swap.uuid,
		from: swap.direction === 'out' ? balance : asset,
		to: swap.direction === 'out' ? asset : balance,
		amountIn: swapAmount(swap),
		amountOut: swapAmount(swap),
		statusKey: `crypto.wallet.swap.status.${swap.status}`,
		phase: SWAP_PHASE[swap.status] ?? 'problem',
		createdAt: swap.created_at,
	}
}

export const entryFromOrder = (order: ExchangeOrder): HistoryEntry => ({
	key: `exchange:${order.uuid}`,
	kind: 'exchange',
	uuid: order.uuid,
	from: { kind: 'asset', assetId: order.from_asset },
	to: { kind: 'asset', assetId: order.to_asset },
	amountIn: order.amount_in,
	amountOut: order.actual_out ?? order.expected_out,
	statusKey: `crypto.wallet.exchange.status.${order.status}`,
	phase: phaseOf(order.status),
	createdAt: order.created_at,
})

const time = (iso: string): number => {
	const ms = Date.parse(iso)
	// Una fecha ilegible va al fondo en vez de romper el orden de toda la lista
	return Number.isNaN(ms) ? 0 : ms
}

/**
 * Funde las dos listas en orden cronológico inverso.
 *
 * El corte es lo delicado: cada lista llega paginada por su lado, así que mientras a una
 * le queden páginas NO se puede pintar nada más antiguo que su fila más vieja ya cargada —
 * entre medias podrían caber filas suyas que aún no han llegado, y aparecerían de golpe en
 * mitad de la lista al pasar de página. Se corta en la más reciente de esas fronteras y lo
 * de más abajo espera a la siguiente página.
 */
export const mergeHistory = ({ orders, swaps, moreOrders = false, moreSwaps = false }: {
	orders: ExchangeOrder[]
	swaps: Swap[]
	moreOrders?: boolean
	moreSwaps?: boolean
}): HistoryEntry[] => {

	const entries = [...orders.map(entryFromOrder), ...swaps.map(entryFromSwap)]
	entries.sort((a, b) => time(b.createdAt) - time(a.createdAt))

	// Frontera de cada lista que aún tiene páginas: su fila más vieja cargada. Sin filas
	// cargadas y con páginas pendientes no hay nada seguro que enseñar todavía
	const floors: number[] = []
	if (moreOrders) { floors.push(orders.length ? time(orders[orders.length - 1].created_at) : Infinity) }
	if (moreSwaps) { floors.push(swaps.length ? time(swaps[swaps.length - 1].created_at) : Infinity) }
	if (floors.length === 0) { return entries }

	const boundary = Math.max(...floors)
	return entries.filter(entry => time(entry.createdAt) >= boundary)
}
