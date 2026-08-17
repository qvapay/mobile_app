import { useQuery } from '@tanstack/react-query'

// APIs
import { p2pApi } from '../../api/p2pApi'

import { unwrap } from '../../api/unwrap'

/**
 * Snapshot del listado por defecto del marketplace para el arranque en frío.
 *
 * OJO: no es una query con fetch propio — la orquestación de peticiones del
 * P2P (debounce 350ms, coalescing de la petición en vuelo, cursores) vive en
 * `useP2POffers` y está calibrada contra el rate limit de 10/min del índice;
 * React Query aquí solo aporta el almacenamiento persistido (vía
 * `setQueryData`/`getQueryData`), reemplazando la clave `p2p_offers` de
 * dataCache sin cambiar ni una petición.
 */
export const P2P_OFFERS_SNAPSHOT_KEY = ['p2p', 'offers-snapshot']

/**
 * Medias de mercado 24h por moneda (`{ TICK: { average_buy, average_sell } }`).
 * Contexto opcional: si falla, la lista funciona igual (el error queda en la
 * query, sin toast, y `data` simplemente no llega).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export const useP2pMarketAveragesQuery = () => useQuery({
	queryKey: ['p2p', 'averages'],
	queryFn: async () => unwrap(await p2pApi.getAverages()),
	staleTime: 60 * 1000,
	placeholderData: previous => previous,
})
