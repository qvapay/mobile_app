/**
 * Cómo llegan los saldos a la caché entre pasada y pasada. PURO (sin React ni React Native).
 *
 * Tres lectores escriben el mismo mapa: la pasada (todas las redes, cada 30 s), la lectura de
 * UNA red tras un envío propio y la lectura lenta. Aquí vive lo que los hace convivir: que una
 * lectura que llega tarde no pise a otra más nueva, que nada se repinte si no cambió, y cuándo
 * se vuelve a mirar la red de un envío.
 */
import { mergeBalances } from '../../../wallet/chains'
import type { WalletBalancesResult } from '../../../wallet/chains'
import type { RawBalances } from '../../../wallet/assets'

/** La caché de saldos de UNA wallet, viva donde viva. */
export type BalanceStore = {
	/** Identifica la wallet: dos lecturas de una red solo se ordenan dentro de la misma. */
	id: string
	get: () => WalletBalancesResult | undefined
	set: (next: WalletBalancesResult) => void
}

/** La lectura de una red: cuál y cuándo se PIDIÓ (no cuándo llegó). */
export type ChainRead = { chainKey: string, startedAt: number }

// Cuándo se pidió la última lectura aplicada de cada red, por wallet
const applied = new Map<string, number>()

/**
 * Lleva `values` a la caché. Devuelve si algo cambió.
 *
 * - Sin caché todavía no hace nada: la primera pasada se pinta entera, no red a red (las que
 *   aún no han contestado saldrían a cero).
 * - Con `read`, una lectura pedida ANTES que la última aplicada de esa red se descarta: llegó
 *   tarde y traería un saldo más viejo que el que ya se ve.
 * - Si ningún valor cambia no escribe, y nadie se repinta.
 */
export const applyBalances = (store: BalanceStore, values: RawBalances, read?: ChainRead): boolean => {
	const current = store.get()
	if (!current) return false
	if (read) {
		const key = `${store.id}|${read.chainKey}`
		if (read.startedAt < (applied.get(key) ?? 0)) return false
		applied.set(key, read.startedAt)
	}
	const balances = mergeBalances(current.balances, values)
	const ids = Object.keys(balances)
	const unchanged = ids.length === Object.keys(current.balances).length && ids.every(id => balances[id] === current.balances[id])
	if (unchanged) return false
	store.set({ ...current, balances })
	return true
}

/**
 * Cuándo se relee la red de un envío propio, en ms desde que salió. Releer en el segundo 0,
 * como se hacía, devuelve el saldo de antes: ninguna red lo ha confirmado aún. Los primeros
 * cubren las redes de bloque corto (Solana, BNB Smart Chain, TRON); los siguientes, Stacks (un
 * bloque cada ~13 s) y Ethereum. Pasado el último sigue el sondeo normal de la pantalla.
 */
export const CHASE_DELAYS_MS = [3_000, 7_000, 13_000, 21_000, 34_000, 55_000]

type Timers = { setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (handle: unknown) => void }

const REAL_TIMERS: Timers = {
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export type BalanceChase = {
	/**
	 * Lee la red, lleva lo leído a la caché y devuelve el saldo crudo del activo en ESA lectura
	 * (undefined si no vino).
	 */
	read: () => Promise<string | undefined>
	/** El saldo del activo al salir el envío. Sin él, la primera lectura hace de punto de partida. */
	baseline: string | undefined
	delays?: number[]
	timers?: Timers
}

/**
 * Relee una red hasta ver moverse el saldo de un activo, o hasta agotar `delays`. Devuelve
 * cómo cancelarla. Un nodo caído no corta la serie: se prueba otra vez en el paso siguiente.
 */
export const startBalanceChase = ({ read, baseline, delays = CHASE_DELAYS_MS, timers = REAL_TIMERS }: BalanceChase): (() => void) => {
	let cancelled = false
	let handle: unknown
	let known = baseline

	const schedule = (index: number): void => {
		if (cancelled || index >= delays.length) return
		const wait = delays[index] - (index > 0 ? delays[index - 1] : 0)
		handle = timers.setTimeout(() => { attempt(index) }, wait)
	}

	const attempt = async (index: number): Promise<void> => {
		if (cancelled) return
		let value: string | undefined
		try { value = await read() } catch { value = undefined }
		if (cancelled) return
		if (value !== undefined) {
			if (known === undefined) known = value
			// Se movió: ya está a la vista, no hay nada más que perseguir
			else if (value !== known) return
		}
		schedule(index + 1)
	}

	schedule(0)
	return () => {
		cancelled = true
		timers.clearTimeout(handle)
	}
}

// La persecución en curso de cada red, por wallet
const chases = new Map<string, () => void>()

/** Una sola persecución por red y wallet: la de un envío nuevo sustituye a la del anterior. */
export const chaseBalance = (id: string, chase: BalanceChase): void => {
	chases.get(id)?.()
	chases.set(id, startBalanceChase(chase))
}
