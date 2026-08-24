import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'

// APIs
import { transferApi } from '../../api/transferApi'
import { blogApi } from '../../api/blogApi'
import { coinsApi } from '../../api/coinsApi'
import { promoApi } from '../../api/promoApi'

import { unwrap } from '../../api/unwrap'

// i18n fuera de render: el mensaje se resuelve en call time (nunca a nivel de módulo)
import i18n from '../../i18n'

/**
 * Raíz de las claves del feed de Home.
 *
 * Que todas cuelguen de `['home', …]` es lo que permite refrescar la pantalla
 * entera con una sola llamada (`refetchQueries({ queryKey: HOME_QUERY_KEY })`),
 * en paralelo y sin tener que acordarse de añadir cada fuente nueva al refresco.
 */
export const HOME_QUERY_KEY = ['home']

const WATCHLIST_COINS = ['BTC', 'ETH', 'LTC', 'SOL']

// Una promo está acotada en el tiempo: nunca resucitar una de hace más de un día
export const PROMO_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Últimas transacciones de la cuenta. */
export const useTransactionsQuery = () => useQuery({
	queryKey: ['home', 'transactions'],
	queryFn: async () => unwrap(await transferApi.getLatestTransactions({ take: 6 })),
	placeholderData: previous => previous,
})

// Compartida con el carrusel de Send; vive en /hooks/ para que Send no
// arrastre el resto del feed a sus tests. Se re-exporta para los consumidores
// del feed de Home.
export { useQuickPayQuery } from '../../hooks/useQuickPayQuery'

/** Últimas entradas del blog (WordPress). */
export const useBlogQuery = () => useQuery({
	queryKey: ['home', 'blog', Platform.isPad ? 4 : 3],
	queryFn: async () => unwrap(await blogApi.getLatestPosts(Platform.isPad ? 4 : 3)),
	// El blog cambia poco y no es crítico: no merece un viaje en cada montaje
	staleTime: 10 * 60 * 1000,
	placeholderData: previous => previous,
})

/** Variación 24h de las cuatro criptos destacadas. */
export const useWatchlistQuery = () => useQuery({
	queryKey: ['home', 'watchlist', WATCHLIST_COINS],
	queryFn: async () => {
		const results = await Promise.all(
			WATCHLIST_COINS.map(tick => coinsApi.priceHistory(tick, '24H'))
		)
		const data = results.map((result, i) => {
			const tick = WATCHLIST_COINS[i]
			if (!result.success || !result.data?.length) {
				return { tick, price: 0, change: 0, priceHistory: [] }
			}
			const history = result.data
			const first = history[0].value
			const last = history[history.length - 1].value
			const change = first > 0 ? ((last - first) / first) * 100 : 0
			return { tick, price: last, change, priceHistory: history }
		})
		// Sin conexión fallan las cuatro y quedaría una tabla de ceros. Lanzando
		// aquí, React Query conserva los últimos precios buenos en pantalla — que
		// es justo lo que hacía la guarda manual anterior, pero sin escribirla
		if (!data.some(c => c.priceHistory.length)) {
			throw new Error(i18n.t('home.watchlist.updateFailed'))
		}
		return data
	},
	staleTime: 60 * 1000,
	placeholderData: previous => previous,
})

/** Banner promocional vigente, o null. */
export const usePromoQuery = () => useQuery({
	queryKey: ['home', 'promo'],
	queryFn: async () => unwrap(await promoApi.getPromo()),
	staleTime: 5 * 60 * 1000,
})
