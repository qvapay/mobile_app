/**
 * Datos de las acciones tokenizadas (xStocks), raíz `['wallet', 'xstocks', …]`. Nada exige
 * cuenta de QvaPay:
 *   · disponibilidad por región — qpweb, público (la IP decide);
 *   · precios — directo a Jupiter;
 *   · multiplicadores de dividendos — directo a la cadena por el router de RPCs.
 * Las posiciones salen de los saldos que la wallet ya lee (`useWalletAssets`).
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { xstocksApi } from '../../../api/xstocksApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import { useWalletAssets } from '../wallet/walletQueries'
import { buildPositions, summarizePortfolio } from './xstocksModel'
import { useXStockQuotes } from './xstocksPrices'

export { useXStockMints, useXStockQuotes, useXStockShares, XSTOCKS_MINTS_KEY, XSTOCKS_PRICES_KEY } from './xstocksPrices'

export const XSTOCKS_AVAILABILITY_KEY = ['wallet', 'xstocks', 'availability']

/**
 * ¿Se pueden ofrecer acciones aquí? Falla CERRADO: sin respuesta, no se enseñan. La región
 * cambia poco: 10 min de frescura.
 */
export const useXStocksAvailability = () => {
	const query = useQuery({
		queryKey: XSTOCKS_AVAILABILITY_KEY,
		queryFn: async () => unwrap(await xstocksApi.availability()),
		staleTime: 10 * 60_000,
		retry: shouldRetry,
		// Viajar de país no debe dejar la decisión de otro país en disco
		meta: { noPersist: true },
	})
	return { available: query.data?.available === true, isLoading: query.isPending }
}

/**
 * Posiciones (una por xStock) y resumen de la cartera. `enabled: false` = no cotizar (las
 * superficies que aún no enseñan acciones: fuera de región, otra pestaña…).
 */
export const useXStockPortfolio = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const { all, isLoading: balancesLoading } = useWalletAssets()
	const { quotes, scaledUi, isLoading: quotesLoading, isError, refetch } = useXStockQuotes({ enabled })
	const balances = useMemo(() => {
		const map: Record<string, string> = {}
		// `AssetView.amount` es decimal humano del saldo CRUDO: se vuelve a unidades mínimas
		all.forEach(view => { if (view.stock) map[view.id] = view.rawAmount })
		return map
	}, [all])
	const positions = useMemo(() => buildPositions({ balances, quotes, scaledUi, nowSeconds: Math.floor(Date.now() / 1000) }), [balances, quotes, scaledUi])
	const summary = useMemo(() => summarizePortfolio(positions), [positions])
	return { positions, summary, isLoading: balancesLoading || quotesLoading, isError, refetch }
}
