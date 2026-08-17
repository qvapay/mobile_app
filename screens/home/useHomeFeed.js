import FastImage from '@d11/react-native-fast-image'
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// Auth Context
import { useAuth } from '../../auth/AuthContext'

// APIs
import { userApi } from '../../api/userApi'
import { unwrap } from '../../api/unwrap'

// Update prompt
import { maybePromptUpdate } from '../../helpers/versionCheck'

// Queries del feed
import {
	HOME_QUERY_KEY,
	PROMO_MAX_AGE_MS,
	useTransactionsQuery,
	useQuickPayQuery,
	useBlogQuery,
	useWatchlistQuery,
	usePromoQuery,
} from './homeQueries'

/**
 * Owns the Home feed data: perfil (`GET /user/extended`), últimas transacciones
 * y destinatarios recientes (`transferApi`), entradas del blog (WordPress REST),
 * la watchlist de 24h (BTC/ETH/LTC/SOL) y los banners de promoción. `onRefresh`
 * lo revalida todo y además comprueba si hay actualización en la tienda
 * (`helpers/versionCheck`), cuyo resultado va a `updateInfo` para
 * `UpdatePromptModal`.
 *
 * Cada fuente es una query independiente bajo `['home', …]`, persistida en
 * AsyncStorage por el `PersistQueryClientProvider` de `App.tsx`: la pantalla se
 * pinta al instante en arranque en frío con lo último que se vio y revalida por
 * detrás. Un fetch fallido deja los datos anteriores en pantalla en vez de un
 * estado vacío.
 *
 * Devuelve la misma forma que la versión anterior basada en `useEffect` +
 * reducer, para que `Home.jsx` no tenga que cambiar.
 *
 * @returns {{
 *   latestTransactions: Array, latestSentTransfersUsers: Array,
 *   latestBlogPosts: Array, watchlistData: Array, promo: Object|null,
 *   updateInfo: Object|null, txLoading: boolean, txError: boolean,
 *   refreshing: boolean, onRefresh: Function, dismissUpdate: Function,
 * }}
 */
export default function useHomeFeed() {

	const { updateUser } = useAuth()
	const queryClient = useQueryClient()

	// `refreshing` es un estado propio y NO `useIsFetching`: BalanceCard lo usa
	// como flanco de subida para recargar el resumen de ahorros, así que solo
	// debe activarse en un tirón del usuario, no en cada revalidación de fondo
	const [refreshing, setRefreshing] = useState(false)
	const [updateInfo, setUpdateInfo] = useState(null)

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
		const avatarUrls = list.flatMap(t => {
			const img = (t.paid_by_user || t.user)?.image
			return img ? [{ uri: `https://media.qvapay.com/${img}` }] : []
		})
		if (avatarUrls.length > 0) FastImage.preload(avatarUrls)
	}, [transactions.data])

	// Una promo caducada no se resucita aunque siga en la caché persistida
	const promoFresh = promo.dataUpdatedAt && (Date.now() - promo.dataUpdatedAt) > PROMO_MAX_AGE_MS
		? null
		: (promo.data || null)

	/**
	 * Pull-to-refresh: revalida las seis fuentes EN PARALELO. La versión anterior
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
		updateInfo,
		txLoading: transactions.isPending,
		txError: transactions.isError,
		refreshing,
		onRefresh,
		dismissUpdate,
	}
}
