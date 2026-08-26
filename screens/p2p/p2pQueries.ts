import { useQuery } from '@tanstack/react-query'

// APIs
import { p2pApi } from '../../api/p2pApi'

import { unwrap } from '../../api/unwrap'

import type { P2PMarketAverages, P2POffer, P2PUser } from '../../types/domain'

/**
 * Payload de `GET /p2p/user/{uuid}` (p2pApi.peerProfile, tipado `unknown` en
 * el módulo de API). Modelado desde lo que LEEN P2PUser y useP2POfferDetail:
 * todo opcional porque el backend recorta secciones según `viewer_gold`.
 */

/** Métricas agregadas del trader (`data.stats`). Números que llegan como string se envuelven en Number() en el render. */
export type PeerStats = {
	averageRating?: number | string
	completionRate?: number | string
	completedP2P?: number | string
	ratersCount?: number | string
	totalVolume?: number | string
	volume30d?: number | string
	operations30d?: number | string
	cancellationRate?: number | string
	total?: number
	completed?: number
} & Record<string, unknown>

/** Una valoración recibida o emitida. `rater`/`rated` faltan si la cuenta fue borrada. */
export type PeerRating = {
	id: number | string
	rating: number
	created_at?: string
	rater?: P2PUser | null
	rated?: P2PUser | null
}

/** Bloque de valoraciones (`receivedRatings` / `sentRatings`). */
export type PeerRatings = {
	items: PeerRating[]
	total: number
	/** Reparto por estrellas: `{ 5: n, 4: n, … }`. */
	distribution?: Record<number | string, number>
}

/** Ranking global del trader (solo GOLD lo ve completo). */
export type PeerRanking = {
	unique_peers?: number | string
	avg_completion_time?: number | string
} & Record<string, unknown>

/** Moneda más operada por el trader (pestaña Stats). */
export type PeerTopCoin = {
	tick: string
	name?: string
	logo?: string
	count: number
	volume?: number | string
}

/** Enlaces sociales del perfil de empresa/dominio verificado. */
export type PeerDomain = {
	website?: string | null
	twitter?: string | null
	instagram?: string | null
	telegram?: string | null
	whatsapp?: string | null
}

export type PeerProfilePayload = {
	user?: P2PUser & Record<string, unknown>
	stats?: PeerStats
	ranking?: PeerRanking | null
	activeOffers?: P2POffer[]
	topCoins?: PeerTopCoin[]
	receivedRatings?: PeerRatings
	sentRatings?: PeerRatings
	domain?: PeerDomain | null
	/** Autoridad del gating GOLD: NUNCA se sustituye por un flag cacheado local. */
	viewer_gold?: boolean
	is_self?: boolean
}

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
export const P2P_OFFERS_SNAPSHOT_KEY = ['p2p', 'offers-snapshot'] as const

/**
 * Medias de mercado 24h por moneda (`{ TICK: { average_buy, average_sell } }`).
 * Contexto opcional: si falla, la lista funciona igual (el error queda en la
 * query, sin toast, y `data` simplemente no llega).
 */
export const useP2pMarketAveragesQuery = () => useQuery<P2PMarketAverages | null>({
	queryKey: ['p2p', 'averages'],
	queryFn: async () => unwrap(await p2pApi.getAverages()),
	staleTime: 60 * 1000,
	placeholderData: previous => previous,
})
