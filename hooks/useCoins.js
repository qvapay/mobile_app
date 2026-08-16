import { useState, useEffect } from 'react'
import coinsApi from '../api/coinsApi'
import { CACHE_KEYS, readCache, writeCache } from '../helpers/dataCache'

// Memoria de módulo: dentro de una misma sesión, entrar dos veces a Depositar
// (o saltar de Depositar a Extraer) no vuelve a tocar disco ni red
const memory = new Map()
const memoryAt = new Map()
const inflight = new Map()

// El catálogo de monedas es casi estático (cambia cuando se habilita un rail
// nuevo), así que una copia de un día sigue siendo buena para pintar al
// instante mientras se revalida por detrás
const MAX_AGE_MS = 24 * 60 * 60 * 1000

// Pero el PRECIO de cada moneda sí se mueve, y alimenta los cálculos de dinero
// de Withdraw y la conversión de QPCoinRow: la copia en memoria se revalida
// pasado este tiempo para que una sesión larga no opere con precios viejos
const MEMORY_TTL_MS = 60 * 1000

/** Filtros soportados, cada uno con su clave de caché en disco. */
export const COIN_FILTERS = {
	in: { params: { enabled_in: true }, cacheKey: CACHE_KEYS.COINS_IN },
	out: { params: { enabled_out: true }, cacheKey: CACHE_KEYS.COINS_OUT },
	p2p: { params: { enabled_p2p: true }, cacheKey: CACHE_KEYS.P2P_COINS },
	all: { params: {}, cacheKey: CACHE_KEYS.COINS_ALL },
}

/** Solo para tests: la memoria de módulo rompería el aislamiento entre casos. */
export const clearCoinsMemory = () => {
	memory.clear()
	memoryAt.clear()
	inflight.clear()
}

const fetchCoins = (kind) => {
	if (inflight.has(kind)) return inflight.get(kind)
	const { params, cacheKey } = COIN_FILTERS[kind] || COIN_FILTERS.all
	const promise = coinsApi.index(params)
		.then((res) => {
			if (res?.success && Array.isArray(res.data) && res.data.length) {
				memory.set(kind, res.data)
				memoryAt.set(kind, Date.now())
				writeCache(cacheKey, res.data)
				return res.data
			}
			return null
		})
		.catch(() => null)
		.finally(() => inflight.delete(kind))
	inflight.set(kind, promise)
	return promise
}

/**
 * Catálogo de monedas con hidratación instantánea (stale-while-revalidate).
 *
 * Antes cada pantalla con selector de moneda hacía su propia petición al
 * montar y esperaba a la red con un "Cargando monedas…": abrir Depositar,
 * Extraer, Crear oferta o Métodos de pago costaba un viaje completo cada vez.
 * Ahora la lista se pinta al momento desde memoria o disco y la red solo
 * refresca por detrás.
 *
 * @param {'in'|'out'|'p2p'|'all'} kind - Qué subconjunto del catálogo se necesita.
 * @returns {{ coins: Array, isLoading: boolean }} `isLoading` solo es true
 *   cuando NO hay nada que pintar todavía (primer arranque sin caché).
 */
export default function useCoins(kind = 'all') {

	const [coins, setCoins] = useState(() => memory.get(kind) || [])
	const [isLoading, setIsLoading] = useState(() => !memory.has(kind))

	useEffect(() => {
		let cancelled = false
		// Guarda contra la carrera disco/red: si la red ya resolvió, el catálogo
		// de disco NO debe pisarla (ni colarse en la memoria compartida, que
		// envenenaría al resto de pantallas durante toda la sesión)
		let hasFresh = false
		const cached = memory.get(kind)
		const freshEnough = cached && (Date.now() - (memoryAt.get(kind) || 0) < MEMORY_TTL_MS)

		if (cached) {
			setCoins(cached)
			setIsLoading(false)
			// Con la copia caliente aún fresca no se revalida; pasado el TTL sí,
			// porque los precios se mueven
			if (freshEnough) return
		} else {
			setIsLoading(true)

			// Disco primero: pinta mientras la red responde
			readCache(COIN_FILTERS[kind]?.cacheKey || CACHE_KEYS.COINS_ALL, { maxAgeMs: MAX_AGE_MS })
				.then((stored) => {
					if (cancelled || hasFresh || !stored?.length) return
					memory.set(kind, stored)
					setCoins(stored)
					setIsLoading(false)
				})
				.catch(() => { })
		}

		fetchCoins(kind).then((fresh) => {
			if (cancelled) return
			if (fresh) {
				hasFresh = true
				setCoins(fresh)
			}
			setIsLoading(false)
		})

		return () => { cancelled = true }
	}, [kind])

	return { coins, isLoading }
}
