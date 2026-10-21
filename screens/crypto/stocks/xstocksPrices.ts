/**
 * Precios y multiplicadores de los xStocks (raíz `['wallet', 'xstocks', …]`). Módulo aparte de
 * `xstocksQueries.ts` porque lo usan también los saldos de la wallet (`usePriceMap` valora las
 * acciones), y `xstocksQueries` depende de `walletQueries`: juntos serían un import circular.
 */
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'

import { xstocksApi } from '../../../api/xstocksApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import { getAppRpcRouter } from '../../../wallet/registry/appRpcRouter'
import { jsonRpc } from '../../../wallet/chains/http'
import { parseMintInfo } from '../../../wallet/solana/mint'
import type { JsonParsedMintAccount } from '../../../wallet/solana/mint'
import { XSTOCKS, XSTOCKS_CHAIN } from '../../../wallet/xstocks'
import { sharesOf, toQuote } from './xstocksModel'
import type { ScaledUiMap, XStockQuote } from './xstocksModel'

export const XSTOCKS_PRICES_KEY = ['wallet', 'xstocks', 'prices']
export const XSTOCKS_MINTS_KEY = ['wallet', 'xstocks', 'mints']

const MINTS = XSTOCKS.map(stock => stock.mint)

/** Los precios de mercado se mueven segundo a segundo; con la pantalla abierta, cada 20 s. */
const PRICES_STALE_MS = 20_000

const NO_SCALED_UI: ScaledUiMap = {}

/** Multiplicador de Scaled UI de cada mint, leído de la cadena (cambia con cada dividendo: 1 h). */
export const useXStockMints = ({ enabled = true }: { enabled?: boolean } = {}) => useQuery<ScaledUiMap>({
	queryKey: XSTOCKS_MINTS_KEY,
	queryFn: () => getAppRpcRouter().call(XSTOCKS_CHAIN, async (rpc, signal) => {
		const result = await jsonRpc<{ value?: Array<NonNullable<JsonParsedMintAccount>['value']> }>(
			rpc.url, 'getMultipleAccounts', [MINTS, { encoding: 'jsonParsed', commitment: 'confirmed' }], { signal, headers: rpc.headers },
		)
		const map: ScaledUiMap = {}
		MINTS.forEach((mint, index) => {
			const info = parseMintInfo({ value: result?.value?.[index] ?? null })
			if (info) map[mint] = info.scaledUi
		})
		return map
	}, { idempotent: true }),
	enabled,
	staleTime: 60 * 60_000,
})

/**
 * Cotización por mint (precio por acción y por cruda + variación 24 h).
 *
 * `enabled: false` no pide nada (ni Jupiter cada 20 s ni los mints a la cadena) pero sigue
 * devolviendo lo que haya en caché: las superficies que no enseñan acciones lo apagan.
 */
export const useXStockQuotes = ({ enabled = true }: { enabled?: boolean } = {}) => {
	const isFocused = useIsFocused()
	const mints = useXStockMints({ enabled })
	const prices = useQuery({
		queryKey: XSTOCKS_PRICES_KEY,
		queryFn: async () => unwrap(await xstocksApi.prices(MINTS)),
		enabled,
		staleTime: PRICES_STALE_MS,
		refetchInterval: isFocused && enabled ? PRICES_STALE_MS : false,
		retry: shouldRetry,
		placeholderData: previous => previous,
	})
	const quotes = useMemo(() => {
		const now = Math.floor(Date.now() / 1000)
		const out: Record<string, XStockQuote | null> = {}
		MINTS.forEach(mint => { out[mint] = toQuote(prices.data?.[mint], mints.data?.[mint], now) })
		return out
	}, [prices.data, mints.data])
	return { quotes, isLoading: prices.isPending, isError: prices.isError && !prices.data, refetch: prices.refetch, scaledUi: mints.data ?? NO_SCALED_UI }
}

/**
 * Cómo pinta la wallet una acción: ACCIONES (crudo × multiplicador) y precio POR ACCIÓN, la
 * misma cifra que "Tus acciones". El valor USD no cambia (sale del precio por cruda).
 */
export const useXStockShares = (enabled: boolean) => {
	const { quotes, scaledUi } = useXStockQuotes({ enabled })
	return useCallback((mint: string, rawAmount: string) => ({
		shares: sharesOf(BigInt(rawAmount), scaledUi[mint], Math.floor(Date.now() / 1000)),
		price: quotes[mint]?.price ?? null,
	}), [quotes, scaledUi])
}

