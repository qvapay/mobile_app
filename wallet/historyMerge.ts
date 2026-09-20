/**
 * Fusión del historial on-chain con lo ya guardado en disco. Módulo PURO.
 *
 * El historial se sincroniza "por ancla": se pide la página más reciente y
 * se para en cuanto aparece un hash ya conocido — lo anterior a ese punto ya
 * lo tenemos. Las páginas se fusionan por hash (un movimiento pendiente que
 * vuelve confirmado se reemplaza), se ordenan por tiempo desc y se acotan.
 */
import type { WalletTx } from '../types/domain'

/** Tope de movimientos guardados por activo: lo más antiguo se descarta. */
export const HISTORY_CACHE_MAX_ITEMS = 500

/** Cuántas páginas hacia lo nuevo se encadenan como máximo en una sincronización. */
export const HISTORY_SYNC_MAX_PAGES = 5

export type HistoryCache = {
	/** Más reciente primero, sin hashes repetidos (varios eventos de una misma tx se distinguen por hash+índice, ver `txKey`). */
	items: WalletTx[]
	/** Cursor para seguir hacia lo ANTIGUO; null = ya se llegó al final. */
	olderCursor: string | null
	/** true cuando alguna carga llegó al final (olderCursor null por agotamiento, no por no haber pedido nunca). */
	complete: boolean
	updatedAt: number
}

export const emptyHistoryCache = (): HistoryCache => ({ items: [], olderCursor: null, complete: false, updatedAt: 0 })

/**
 * Clave de deduplicación. Varias transferencias de token en una misma tx
 * comparten hash (el proxy lo advierte): se distingue por contraparte y
 * cantidad para no fundirlas en una.
 */
export const txKey = (tx: WalletTx): string => `${tx.hash}:${tx.direction}:${tx.from ?? ''}:${tx.to ?? ''}:${tx.amount}:${tx.kind ?? 'transfer'}`

const sortDesc = (items: WalletTx[]): WalletTx[] => items.slice().sort((a, b) => b.time - a.time)

/** Une páginas nuevas con lo guardado: lo nuevo pisa (estado pendiente → confirmado), orden desc, tope. */
export const mergeHistory = (existing: WalletTx[], incoming: WalletTx[]): WalletTx[] => {
	const byKey = new Map<string, WalletTx>()
	for (const tx of existing) byKey.set(txKey(tx), tx)
	for (const tx of incoming) byKey.set(txKey(tx), tx)
	return sortDesc([...byKey.values()]).slice(0, HISTORY_CACHE_MAX_ITEMS)
}

/** ¿La página trae algún movimiento que ya está guardado? (= alcanzamos el ancla). */
export const overlapsCache = (cache: HistoryCache, page: WalletTx[]): boolean => {
	if (cache.items.length === 0) return false
	const known = new Set(cache.items.map(txKey))
	return page.some(tx => known.has(txKey(tx)))
}

/**
 * Aplica una sincronización hacia lo NUEVO. `pages` son las páginas pedidas
 * desde la más reciente hasta parar (por ancla, por fin de datos o por tope).
 * Si la caché estaba vacía, el cursor de la última página pasa a ser el
 * cursor hacia lo antiguo; si ya había historial, el cursor antiguo se
 * conserva (lo nuevo no cambia dónde seguir hacia atrás).
 */
export const applyNewerPages = (cache: HistoryCache, pages: Array<{ items: WalletTx[], next_cursor: string | null }>, now: number): HistoryCache => {
	const incoming = pages.flatMap(page => page.items)
	const wasEmpty = cache.items.length === 0
	const last = pages[pages.length - 1]
	const olderCursor = wasEmpty ? (last?.next_cursor ?? null) : cache.olderCursor
	const complete = wasEmpty ? !!last && last.next_cursor === null : cache.complete
	return { items: mergeHistory(cache.items, incoming), olderCursor, complete, updatedAt: now }
}

/** Aplica una página hacia lo ANTIGUO (scroll): añade y avanza el cursor. */
export const applyOlderPage = (cache: HistoryCache, page: { items: WalletTx[], next_cursor: string | null }, now: number): HistoryCache => ({
	items: mergeHistory(cache.items, page.items),
	olderCursor: page.next_cursor,
	complete: page.next_cursor === null,
	updatedAt: now,
})
