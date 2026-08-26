import { useQuery } from '@tanstack/react-query'
import coinsApi, { type CoinFilters } from '../api/coinsApi'
import { unwrap } from '../api/unwrap'
import i18n from '../i18n'
import type { Coin } from '../types/domain'

// El catálogo es casi estático, pero el PRECIO de cada moneda sí se mueve y
// alimenta cálculos de dinero (Withdraw, conversión de QPCoinRow): la copia
// caliente se revalida pasado este tiempo para que una sesión larga no opere
// con precios viejos
const FRESH_TTL_MS = 60 * 1000

/** Filtros soportados (cada uno es su propia query bajo `['coins', kind]`). */
export const COIN_FILTERS = {
	in: { params: { enabled_in: true } },
	out: { params: { enabled_out: true } },
	p2p: { params: { enabled_p2p: true } },
	all: { params: {} },
} satisfies Record<string, { params: CoinFilters }>

/** Subconjunto del catálogo que pide cada pantalla. */
export type CoinFilterKind = keyof typeof COIN_FILTERS

/**
 * Catálogo de monedas con hidratación instantánea, sobre React Query.
 *
 * Las tres capas manuales que tenía este hook (memoria de módulo + AsyncStorage
 * 24h + dedup de peticiones en vuelo) son exactamente lo que la caché de
 * queries da de serie: caché en memoria compartida entre pantallas, persister
 * global a disco y deduplicación por clave. `staleTime` reproduce el TTL de la
 * copia caliente: dentro del minuto no se revalida, pasado sí.
 *
 * Una respuesta vacía se trata como fallo a propósito: el catálogo nunca está
 * legítimamente vacío, y un `[]` espurio no debe borrar la lista con la que las
 * pantallas de dinero ya están operando.
 *
 * @param kind - Qué subconjunto del catálogo se necesita.
 * @returns `{ coins, isLoading }` — `isLoading` solo es true
 *   cuando NO hay nada que pintar todavía (primer arranque sin caché).
 */
export default function useCoins(kind: CoinFilterKind = 'all'): { coins: Coin[], isLoading: boolean } {

	const query = useQuery({
		queryKey: ['coins', kind],
		queryFn: async () => {
			const { params } = COIN_FILTERS[kind] || COIN_FILTERS.all
			const list = unwrap(await coinsApi.index(params)) || []
			if (!list.length) { throw new Error(i18n.t('hooks.coins.emptyCatalog')) }
			return list
		},
		staleTime: FRESH_TTL_MS,
		placeholderData: previous => previous,
	})

	return { coins: query.data || [], isLoading: query.isPending }
}
