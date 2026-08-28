import FastImage from '@d11/react-native-fast-image'
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// APIs
import { userApi } from '../../api/userApi'
import { unwrap } from '../../api/unwrap'

// Sonido de dinero entrante (espejo del money_out de SendSuccess)
import useIncomingMoneySound from '../../hooks/useIncomingMoneySound'

// Update prompt
import { maybePromptUpdate } from '../../helpers/versionCheck'
import type { UpdateCheckResult } from '../../helpers/versionCheck'
import type { EmbeddedUser, Transaction } from '../../types/domain'

// Queries del feed
import {
	HOME_QUERY_KEY,
	PROMO_MAX_AGE_MS,
	useTransactionsQuery,
	useQuickPayQuery,
	useBlogQuery,
	useWatchlistQuery,
	usePromoQuery,
	useAnnouncementQuery,
} from './homeQueries'

/**
 * Owns the Home feed data: perfil (`GET /user/extended`), últimas transacciones
 * y destinatarios recientes (`transferApi`), entradas del blog (WordPress REST),
 * la watchlist de 24h (BTC/ETH/LTC/SOL), el banner de promoción y el aviso
 * global gestionado desde el panel admin. `onRefresh` lo revalida todo y además
 * comprueba si hay actualización en la tienda (`helpers/versionCheck`), cuyo
 * resultado va a `updateInfo` para `UpdatePromptModal`.
 *
 * Cada fuente es una query independiente bajo `['home', …]`, persistida en
 * AsyncStorage por el `PersistQueryClientProvider` de `App.tsx`: la pantalla se
 * pinta al instante en arranque en frío con lo último que se vio y revalida por
 * detrás. Un fetch fallido deja los datos anteriores en pantalla en vez de un
 * estado vacío.
 *
 * Devuelve la misma forma que la versión anterior basada en `useEffect` +
 * reducer, para que `Home.tsx` no tenga que cambiar.
 */
export default function useHomeFeed() {

	const { updateUser } = useAuth()
	const queryClient = useQueryClient()

	// `refreshing` es un estado propio y NO `useIsFetching`: BalanceCard lo usa
	// como flanco de subida para recargar el resumen de ahorros, así que solo
	// debe activarse en un tirón del usuario, no en cada revalidación de fondo
	const [refreshing, setRefreshing] = useState(false)
	const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)

	// El perfil se pide como query para que entre en el refresco conjunto, pero
	// su resultado vive en AuthContext, no aquí
	const profile = useQuery({
		queryKey: ['home', 'profile'],
		queryFn: async () => unwrap(await userApi.getUserProfile()),
	})

	const transactions = useTransactionsQuery()
	const quickPay = useQuickPayQuery()
	const blog = useBlogQuery()
	const watchlist = useWatchlistQuery()
	const promo = usePromoQuery()
	const announcement = useAnnouncementQuery()

	// Un cobro nuevo en la lista hace sonar la moneda (money_in)
	useIncomingMoneySound(transactions.data)

	// Volcar el perfil recién traído en el contexto de autenticación
	useEffect(() => {
		if (profile.data) { updateUser(profile.data) }
	}, [profile.data, updateUser])

	// Precarga de avatares. Va aquí y no dentro del `queryFn` a propósito: con la
	// caché persistida, un acierto sin revalidación no ejecuta el queryFn y los
	// avatares se quedarían sin precargar justo en el arranque en frío, que es
	// cuando más se nota
	// Se depende de `transactions.data`, no de la lista con `|| []`: ese fallback
	// crea un array nuevo en cada render y la precarga se dispararía siempre
	useEffect(() => {
		const list = transactions.data
		if (!list?.length) return
		const avatarUrls = list.flatMap((t: Transaction) => {
			// `paid_by_user` no está en el contrato de Transaction (la lista manda
			// `PaidBy` y el detalle `paid_by`): se deja EXACTAMENTE igual y se tipa
			// con un cast local — el camino real que se usa hoy es `t.user`
			const img = ((t as Transaction & { paid_by_user?: EmbeddedUser | null }).paid_by_user || t.user)?.image
			return img ? [{ uri: `https://media.qvapay.com/${img}` }] : []
		})
		if (avatarUrls.length > 0) FastImage.preload(avatarUrls)
	}, [transactions.data])

	// Una promo caducada no se resucita aunque siga en la caché persistida
	const promoFresh = promo.dataUpdatedAt && (Date.now() - promo.dataUpdatedAt) > PROMO_MAX_AGE_MS
		? null
		: (promo.data || null)

	// Ni un aviso pasado de fecha. El backend ya filtra por su ventana, pero en
	// arranque en frío la pantalla pinta lo persistido ANTES de revalidar, y ahí
	// `ends_at` es lo único que evita enseñar un aviso que ya terminó
	const announcementLive = announcement.data && (!announcement.data.ends_at || Date.parse(announcement.data.ends_at) > Date.now())
		? announcement.data
		: null

	/**
	 * Pull-to-refresh: revalida todas las fuentes EN PARALELO. La versión anterior
	 * encadenaba seis `await`, acumulando una latencia tras otra.
	 */
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			const [, info] = await Promise.all([
				queryClient.refetchQueries({ queryKey: HOME_QUERY_KEY }),
				maybePromptUpdate(),
			])
			if (info?.needsUpdate) setUpdateInfo(info)
		} catch { /* error refreshing data */ }
		finally { setRefreshing(false) }
	}, [queryClient])

	const dismissUpdate = useCallback(() => setUpdateInfo(null), [])

	return {
		latestTransactions: transactions.data || [],
		latestSentTransfersUsers: quickPay.data || [],
		latestBlogPosts: blog.data || [],
		watchlistData: watchlist.data || [],
		promo: promoFresh,
		announcement: announcementLive,
		updateInfo,
		txLoading: transactions.isPending,
		txError: transactions.isError,
		refreshing,
		onRefresh,
		dismissUpdate,
	}
}
