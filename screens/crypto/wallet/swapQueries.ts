/**
 * Historial de swaps con el saldo QvaPay (`GET /swap`), raíz `['swap', …]`.
 *
 * Vive aparte de `exchangeQueries` porque es OTRO motor: otra tabla, otros estados y otra
 * pantalla de detalle. Quien los junta en una sola lista es `historyModel`.
 */
import { useInfiniteQuery } from '@tanstack/react-query'

// API
import { swapApi } from '../../../api/swapApi'
import type { SwapListPayload } from '../../../api/swapApi'
import { unwrap } from '../../../api/unwrap'

// Tipos
import type { Swap } from '../../../types/domain'

export const SWAP_LIST_KEY = ['swap', 'list']

export const SWAP_LIST_PAGE_SIZE = 20

/**
 * Swaps del usuario, más reciente primero.
 *
 * Un fallo aquí NO puede vaciar el historial: el otro motor es independiente y su lista
 * sigue siendo válida. Por eso la pantalla trata el error como "no hay swaps que añadir"
 * en vez de como un fallo de la pantalla entera.
 */
export const useSwapListQuery = () => useInfiniteQuery({
	queryKey: SWAP_LIST_KEY,
	queryFn: async ({ pageParam = 1 }) => unwrap(await swapApi.list({ page: pageParam as number, take: SWAP_LIST_PAGE_SIZE })),
	initialPageParam: 1,
	// El backend manda el TOTAL, no el número de páginas: la siguiente existe mientras lo
	// ya servido no lo cubra
	getNextPageParam: (last: SwapListPayload | null) => {
		const meta = last?.meta
		if (!meta) { return undefined }
		return meta.page * meta.take < meta.total ? meta.page + 1 : undefined
	},
	placeholderData: previous => previous,
})

export const flattenSwaps = (pages: Array<SwapListPayload | null> | undefined): Swap[] =>
	(pages ?? []).flatMap(page => page?.data ?? [])
