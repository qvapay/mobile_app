import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

// APIs
import { coinsApi } from '../../api/coinsApi'
import { p2pApi } from '../../api/p2pApi'
import { savingApi } from '../../api/savingApi'
import { stocksApi } from '../../api/stocksApi'

import { unwrap } from '../../api/unwrap'
import { useSavingsSummaryQuery } from '../../hooks/useSavingsSummaryQuery'

// i18n fuera de React: resolver EN CALL TIME, nunca a nivel de módulo
import i18n from '../../i18n'

/**
 * Raíz de las claves del dashboard de Invest. El resumen de ahorros NO cuelga
 * de aquí: vive bajo `['savings', …]` porque lo comparte el BalanceCard del
 * Home — el refresco de Invest revalida ambas raíces.
 */
export const INVEST_QUERY_KEY = ['invest']

// Raíles P2P que muestra la tarjeta de mercado
export const P2P_COINS = ['BANK_CUP', 'BANK_MLC', 'CLASICA', 'BANDECPREPAGO', 'ETECSA', 'TROPIPAY', 'ZELLE', 'BOLSATM']

// Cuántas monedas del explorador llevan sparkline (una petición de histórico cada una)
const SPARKLINE_COUNT = 5

/**
 * Convierte el mapa de medias P2P en las filas de la tarjeta de mercado,
 * respetando el orden de `P2P_COINS` y saltándose raíles sin datos.
 *
 * @param {Object} averages - Respuesta de `/p2p/averages` (mapa por tick).
 * @returns {Array<{ tick, name, buy, sell, count }>}
 */
export const mapP2pPairs = (averages) => P2P_COINS.flatMap(tick => {
	const d = averages?.[tick]
	if (!d) return []
	return [{ tick, name: d.name || tick, buy: d.average_buy || 0, sell: d.average_sell || 0, count: d.count || 0 }]
})

/**
 * Normaliza los stocks del backend a la forma que pinta ExploreRow.
 *
 * @param {Array} stocks - Respuesta de `stocksApi.index()`.
 * @returns {Array}
 */
export const mapStocks = (stocks) => (stocks || []).map(s => ({
	tick: s.symbol,
	name: s.name,
	icon: s.icon,
	iconStyle: s.iconStyle,
	image: s.image || null,
	price: s.price,
	change: s.change,
	changeDollar: s.changeDollar,
}))

/**
 * Enriquece las primeras monedas con su histórico 24h (precio, variación y
 * sparkline). Un histórico fallido deja su moneda sin enriquecer en vez de
 * tumbar la lista entera.
 *
 * @param {Array} rawCoins - Monedas de `coinsApi.index`.
 * @param {string[]} ticks - Ticks pedidos, alineados con `historyResults`.
 * @param {Array} historyResults - Respuestas contrato de `priceHistory`.
 * @returns {Array} Monedas con `price/change/changeDollar/priceHistory` donde hubo datos.
 */
export const enrichCoins = (rawCoins, ticks, historyResults) => rawCoins.map(coin => {
	const idx = ticks.indexOf(coin.tick)
	if (idx === -1) return coin
	const res = historyResults[idx]
	if (!res.success || !res.data?.length) return coin
	const history = res.data
	const first = history[0].value
	const last = history[history.length - 1].value
	const change = first > 0 ? ((last - first) / first) * 100 : 0
	return { ...coin, price: last, change, changeDollar: last - first, priceHistory: history }
})

/** Cripto populares del explorador, con sparklines para las primeras. */
export const useInvestCoinsQuery = () => useQuery({
	queryKey: ['invest', 'coins'],
	queryFn: async () => {
		const rawCoins = unwrap(await coinsApi.index({ category_id: 1, trade: 1 })) || []
		if (!rawCoins.length) return []
		const ticks = rawCoins.slice(0, SPARKLINE_COUNT).map(c => c.tick)
		// Los históricos en paralelo; fallos parciales no tumban la lista
		const historyResults = await Promise.all(ticks.map(tick => coinsApi.priceHistory(tick, '24H')))
		return enrichCoins(rawCoins, ticks, historyResults)
	},
	placeholderData: previous => previous,
})

/** Medias de compra/venta del mercado P2P por raíl. */
export const useP2pAveragesQuery = () => useQuery({
	queryKey: ['invest', 'p2p-averages'],
	queryFn: async () => mapP2pPairs(unwrap(await p2pApi.getAverages())),
	placeholderData: previous => previous,
})

/** Stocks del explorador. */
export const useStocksQuery = () => useQuery({
	queryKey: ['invest', 'stocks'],
	queryFn: async () => mapStocks(unwrap(await stocksApi.index())),
	placeholderData: previous => previous,
})

/** Movimientos recientes de la cuenta de ahorro. */
export const useSavingsMovementsQuery = (take = 20) => useQuery({
	queryKey: ['savings', 'movements', take],
	queryFn: async () => {
		const data = unwrap(await savingApi.getTransactions(take))
		return Array.isArray(data) ? data : []
	},
	placeholderData: previous => previous,
})

/** Cotización extendida de un stock. */
export const useStockQuery = (symbol) => useQuery({
	queryKey: ['invest', 'stock', symbol],
	queryFn: async () => unwrap(await stocksApi.show(symbol)),
	enabled: !!symbol,
	placeholderData: previous => previous,
})

/** Histórico de precio de un stock por timeframe (cambiarlo no vacía el gráfico). */
export const useStockHistoryQuery = (symbol, timeframe) => useQuery({
	queryKey: ['invest', 'stock-history', symbol, timeframe],
	queryFn: async () => {
		const data = unwrap(await stocksApi.priceHistory(symbol, timeframe))
		return Array.isArray(data) ? data : []
	},
	enabled: !!symbol,
	placeholderData: previous => previous,
})

/**
 * Histórico de una cripto por timeframe. El endpoint lleva un rate limit
 * agresivo (ráfaga 5, 3/10s) y el backend ya cachea 1h server-side: una hora
 * de staleTime hace que tapear las pills de timeframe no queme la cuota —
 * reemplaza al Map de sesión que tenía CoinDetail.
 *
 * @param {string} tick - Tick de la moneda.
 * @param {string} timeframe - '1H' | '24H' | '1W' | '1M' | '1Y' | 'ALL'.
 * @param {{ enabled?: boolean }} [options]
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export const useCoinHistoryQuery = (tick, timeframe, { enabled = true } = {}) => useQuery({
	queryKey: ['coins', 'history', tick, timeframe],
	queryFn: async () => {
		const data = unwrap(await coinsApi.priceHistory(tick, timeframe))
		// Un historial de 0-1 puntos no pinta gráfico: se trata como fallo para
		// no cachear basura (mismo criterio que el Map anterior)
		if (!Array.isArray(data) || data.length < 2) { throw new Error(i18n.t('invest.queries.historyNoData')) }
		return data
	},
	enabled: enabled && !!tick,
	staleTime: 60 * 60 * 1000,
	placeholderData: previous => previous,
})

/**
 * Owns the Invest dashboard data: resumen de ahorros (query compartida con
 * BalanceCard), cripto populares con sparklines, stocks y medias P2P — cuatro
 * queries independientes que salen EN PARALELO y se persisten por separado.
 *
 * Devuelve la misma forma que consumía la versión anterior de `Invest.jsx`
 * (reducer + fetch manual), incluido el `isLoading` del loader inicial: solo
 * cuando no hay NADA que pintar en el explorador.
 *
 * @returns {{
 *   savings: Object|null, coins: Array, stocks: Array, p2pData: Array,
 *   isLoading: boolean, refreshing: boolean, onRefresh: Function,
 * }}
 */
export const useInvestDashboard = () => {

	const queryClient = useQueryClient()

	// `refreshing` es estado propio: solo el tirón del usuario, no las
	// revalidaciones de fondo
	const [refreshing, setRefreshing] = useState(false)

	const savings = useSavingsSummaryQuery()
	const coins = useInvestCoinsQuery()
	const stocks = useStocksQuery()
	const p2p = useP2pAveragesQuery()

	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try {
			// Dos raíces: el dashboard propio y el resumen de ahorros compartido
			await Promise.all([
				queryClient.refetchQueries({ queryKey: INVEST_QUERY_KEY }),
				queryClient.refetchQueries({ queryKey: ['savings'] }),
			])
		} catch { /* los datos anteriores siguen en pantalla */ }
		finally { setRefreshing(false) }
	}, [queryClient])

	return {
		savings: savings.data || null,
		coins: coins.data || [],
		stocks: stocks.data || [],
		p2pData: p2p.data || [],
		// Loader de pantalla completa solo mientras el explorador no tenga nada
		// que pintar (ni de red ni de la caché persistida)
		isLoading: coins.isPending && stocks.isPending,
		refreshing,
		onRefresh,
	}
}
