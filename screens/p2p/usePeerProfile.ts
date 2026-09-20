/**
 * Perfil público de un trader P2P: una sola llamada (`p2pApi.peerProfile`) trae usuario,
 * stats, ranking, ofertas activas y reseñas recibidas/enviadas.
 *
 * El hook además DESEMPAQUETA el payload con valores por defecto, para que la pantalla
 * nunca tenga que preguntarse si un bloque llegó: `stats`, `activeOffers`, `received`…
 * siempre existen. Las secciones GOLD se fían del `viewer_gold` del servidor y nunca de un
 * flag cacheado en el dispositivo (AsyncStorage puede guardar valores viejos o "stringy"
 * que se colarían por la puerta).
 */
import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner-native'

import { p2pApi } from '../../api/p2pApi'
import { unwrap } from '../../api/unwrap'
import type { PeerProfilePayload, PeerRatings, PeerStats } from './p2pQueries'

const MEDIA_BASE = 'https://media.qvapay.com/'
const DEFAULT_COVER = 'https://media.qvapay.com/covers/timeline.jpg'

const EMPTY_RECEIVED: PeerRatings = { items: [], total: 0, distribution: {} }
const EMPTY_SENT: PeerRatings = { items: [], total: 0 }

export const usePeerProfile = (uuid: string) => {

	const query = useQuery<PeerProfilePayload | null>({
		queryKey: ['p2p', 'user', uuid],
		// peerProfile devuelve `unknown` en el módulo de API — la forma vive en p2pQueries
		queryFn: async () => unwrap(await p2pApi.peerProfile(uuid)) as PeerProfilePayload | null,
		enabled: !!uuid,
		placeholderData: previous => previous,
	})

	const { data, refetch } = query
	const [refreshing, setRefreshing] = useState(false)

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			const res = await refetch()
			if (res.error) toast.error(res.error.message)
		} finally { setRefreshing(false) }
	}, [refetch])

	const user = data?.user
	const received = data?.receivedRatings ?? EMPTY_RECEIVED

	return {
		data,
		refetch,
		refreshing,
		onRefresh,
		loading: query.isPending,
		error: query.error?.message ?? null,
		user,
		viewerGold: data?.viewer_gold === true,
		isSelf: data?.is_self === true,
		stats: (data?.stats ?? {}) as PeerStats,
		ranking: data?.ranking,
		activeOffers: data?.activeOffers ?? [],
		topCoins: data?.topCoins ?? [],
		received,
		sent: data?.sentRatings ?? EMPTY_SENT,
		domain: data?.domain,
		coverUri: user?.cover ? `${MEDIA_BASE}${user.cover}` : DEFAULT_COVER,
		offersCount: (data?.activeOffers ?? []).length,
		reviewsCount: received.total ?? 0,
	}
}

export default usePeerProfile
