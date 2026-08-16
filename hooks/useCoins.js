import { useState, useEffect } from 'react'
import coinsApi from '../api/coinsApi'
import { CACHE_KEYS, readCache, writeCache } from '../helpers/dataCache'

// Memoria de módulo: dentro de una misma sesión, entrar dos veces a Depositar
// (o saltar de Depositar a Extraer) no vuelve a tocar disco ni red
const memory = new Map()
const inflight = new Map()

// El catálogo de monedas es casi estático (cambia cuando se habilita un rail
// nuevo), así que una copia de un día sigue siendo buena para pintar al
// instante mientras se revalida por detrás
const MAX_AGE_MS = 24 * 60 * 60 * 1000

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
	inflight.clear()
}

const fetchCoins = (kind) => {
	if (inflight.has(kind)) return inflight.get(kind)
	const { params, cacheKey } = COIN_FILTERS[kind] || COIN_FILTERS.all
	const promise = coinsApi.index(params)
		.then((res) => {
			if (res?.success && Array.isArray(res.data) && res.data.length) {
				memory.set(kind, res.data)
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
		const cached = memory.get(kind)
		if (cached) {
			// Ya se revalidó en esta sesión: el catálogo cambia cuando se habilita
			// un rail nuevo, así que volver a pedirlo en cada montaje solo gasta
			// cuota. El disco caduca a las 24h, con eso basta para la frescura
			setCoins(cached)
			setIsLoading(false)
			return
		}

		setIsLoading(true)

		// Disco primero: pinta mientras la red responde
		readCache(COIN_FILTERS[kind]?.cacheKey || CACHE_KEYS.COINS_ALL, { maxAgeMs: MAX_AGE_MS })
			.then((stored) => {
				if (cancelled || !stored?.length) return
				memory.set(kind, stored)
				setCoins(stored)
				setIsLoading(false)
			})
			.catch(() => { })

		fetchCoins(kind).then((fresh) => {
			if (cancelled) return
			if (fresh) setCoins(fresh)
			setIsLoading(false)
		})

		return () => { cancelled = true }
	}, [kind])

	return { coins, isLoading }
}
