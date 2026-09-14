/**
 * Datos de la wallet self-custody en React Query, raíz `['wallet', …]`.
 *
 * Saldos: directo del teléfono a las cadenas (router de RPCs). Historial:
 * proxy de qpweb. TODO lo on-chain lleva `meta: { noPersist: true }` (regla
 * dura 5 del plan: el persister escribe AsyncStorage sin cifrar). El registry
 * (`['wallet','registry']`) sí persiste: no es dato del usuario.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AppState } from 'react-native'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'

// API
import { walletApi } from '../../../api/walletApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import type { ApiError } from '../../../api/unwrap'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { getAppRpcRouter, useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { fetchAllBalances } from '../../../wallet/chains'
import type { WalletBalancesResult } from '../../../wallet/chains'
import { addressForKind, buildAssetCatalog, isAssetVisible, sortAssets, toAssetView, totalUsd } from '../../../wallet/assets'
import type { AssetView, AssetVisibility, PriceMap, RawBalances, WalletAsset } from '../../../wallet/assets'

// Settings + catálogo de monedas (precios USD)
import { useSettings } from '../../../settings/SettingsContext'
import useCoins from '../../../hooks/useCoins'

export const WALLET_BALANCES_KEY = ['wallet', 'balances']
export const WALLET_HISTORY_KEY = ['wallet', 'history']

/** Frescura de saldos: un depósito entrante debe verse en < 60s con la pantalla abierta. */
const BALANCES_STALE_MS = 30_000

/**
 * Frescura del historial. Larga a propósito: el historial NO se repide por
 * tiempo sino cuando el SALDO del activo cambia (todo movimiento nuevo mueve
 * el saldo, y el saldo ya se consulta cada 30s directo a la cadena). Así el
 * proxy de qpweb solo recibe una petición por activo y por movimiento real,
 * más el pull-to-refresh explícito del usuario.
 */
const HISTORY_STALE_MS = 5 * 60_000

const NO_PREFS: AssetVisibility = {}

/**
 * Activos cuyo historial debe pedirse saltando la caché del proxy (hasta ese
 * instante). Se arma tras un envío propio y en el pull-to-refresh: una
 * página cacheada en qpweb justo antes de que el explorador indexara la tx
 * la escondería durante todo su TTL.
 */
const freshUntil = new Map<string, number>()
const FRESH_WINDOW_MS = 90_000
/** Lo que tarda el explorador (TronGrid/Etherscan) en indexar una tx recién difundida. */
const INDEXING_DELAY_MS = 20_000

export const markHistoryFresh = (assetId: string): void => { freshUntil.set(assetId, Date.now() + FRESH_WINDOW_MS) }
const isHistoryFresh = (assetId: string): boolean => (freshUntil.get(assetId) ?? 0) > Date.now()

/**
 * Tras un envío propio: no repedir el historial al instante (el explorador
 * aún no lo tiene y cachearíamos una página sin la tx) sino pasados unos
 * segundos y saltando la caché del proxy. La invalidación por cambio de
 * saldo lo cubriría igual, pero llegaría más tarde y sin `fresh`.
 */
export const refreshHistoryAfterSend = (queryClient: QueryClient, assetId: string): void => {
	markHistoryFresh(assetId)
	setTimeout(() => { queryClient.invalidateQueries({ queryKey: [...WALLET_HISTORY_KEY, assetId] }) }, INDEXING_DELAY_MS)
}

/**
 * Saldos crudos de todas las cadenas. Refresca cada 30s SOLO con la pantalla
 * enfocada y al volver la app a foreground; una cadena caída conserva sus
 * saldos previos (ver `fetchAllBalances`).
 */
export const useWalletBalancesQuery = () => {

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const queryClient = useQueryClient()
	const isFocused = useIsFocused()

	const queryKey = useMemo(
		() => [...WALLET_BALANCES_KEY, addresses?.evm ?? '', addresses?.tron ?? '', addresses?.btc ?? ''],
		[addresses],
	)

	const query = useQuery({
		queryKey,
		queryFn: () => fetchAllBalances(
			getAppRpcRouter(),
			registry,
			addresses!,
			queryClient.getQueryData<WalletBalancesResult>(queryKey),
		),
		enabled: !!addresses,
		staleTime: BALANCES_STALE_MS,
		refetchInterval: isFocused ? BALANCES_STALE_MS : false,
		placeholderData: previous => previous,
		meta: { noPersist: true },
	})

	const { refetch } = query
	useEffect(() => {
		if (!isFocused || !addresses) return
		const sub = AppState.addEventListener('change', state => { if (state === 'active') refetch() })
		return () => sub.remove()
	}, [isFocused, addresses, refetch])

	// Saldo que cambia = movimiento nuevo: invalida el historial de ESE activo
	// (y solo de ese). La primera pasada no compara con nada: no hay historial
	// en caché que refrescar.
	const previousRef = useRef<RawBalances | null>(null)
	const balances = query.data?.balances
	useEffect(() => {
		if (!balances) return
		const previous = previousRef.current
		previousRef.current = balances
		if (!previous) return
		for (const [id, value] of Object.entries(balances)) {
			if (previous[id] !== value) queryClient.invalidateQueries({ queryKey: [...WALLET_HISTORY_KEY, id] })
		}
	}, [balances, queryClient])

	return query
}

/** Precio USD por tick del catálogo de QvaPay (misma query `['coins','all']` que el resto de la app). */
export const usePriceMap = (): PriceMap => {
	const { coins } = useCoins('all')
	return useMemo(() => {
		const map: PriceMap = {}
		coins.forEach(coin => {
			const price = Number(coin.price)
			if (Number.isFinite(price) && price > 0) map[coin.tick] = price
		})
		return map
	}, [coins])
}

/** Catálogo completo del registro efectivo (remoto/bundled + nodos custom). */
export const useAssetCatalog = (): WalletAsset[] => {
	const registry = useEffectiveRegistry()
	return useMemo(() => buildAssetCatalog(registry), [registry])
}

/**
 * Todo lo que pinta la home de la wallet: activos valorados, los visibles ya
 * ordenados, el total USD y el estado de carga.
 */
export const useWalletAssets = () => {

	const catalog = useAssetCatalog()
	const prices = usePriceMap()
	const balancesQuery = useWalletBalancesQuery()
	const { getSetting, updateSetting } = useSettings()
	const prefs = getSetting('crypto', 'visibleAssets', NO_PREFS) as AssetVisibility

	const balances = balancesQuery.data?.balances
	const all = useMemo<AssetView[]>(
		() => catalog.map(asset => toAssetView(asset, balances ?? {}, prices)),
		[catalog, balances, prices],
	)
	const visible = useMemo(() => sortAssets(all.filter(view => isAssetVisible(view, prefs))), [all, prefs])
	// El total es el de lo que se VE (como Trust/SafePal): ocultar un activo lo saca de la suma
	const total = useMemo(() => totalUsd(visible), [visible])

	const setAssetVisible = useCallback((id: string, value: boolean) => {
		updateSetting('crypto', 'visibleAssets', { ...prefs, [id]: value })
	}, [prefs, updateSetting])

	return {
		all,
		visible,
		prefs,
		total,
		setAssetVisible,
		/** Sin saldos todavía (ni de la pasada anterior): la UI pinta skeleton. */
		isLoading: !balances && balancesQuery.fetchStatus === 'fetching',
		hasBalances: !!balances,
		isError: balancesQuery.isError && !balances,
		failedChains: balancesQuery.data?.failedChains ?? [],
		refetch: balancesQuery.refetch,
	}
}

/**
 * Historial paginado de un activo en su red (proxy qpweb). Se sirve de
 * memoria mientras el saldo no cambie (ver HISTORY_STALE_MS y la
 * invalidación por saldo en useWalletBalancesQuery). Sin reintentos en
 * 404/503: significan "backend sin desplegar / sin proveedor", no un fallo
 * transitorio — la pantalla ofrece el explorador.
 */
export const useWalletHistoryQuery = (asset: WalletAsset | undefined) => {

	const { addresses } = useWallet()
	const address = asset && addresses ? addressForKind(addresses, asset.kind) : null

	return useInfiniteQuery({
		queryKey: [...WALLET_HISTORY_KEY, asset?.id ?? '', address ?? ''],
		queryFn: async ({ pageParam }) => unwrap(await walletApi.getHistory({
			chain: asset!.chainKey,
			address: address!,
			asset: asset!.contract ?? 'native',
			cursor: pageParam,
			fresh: isHistoryFresh(asset!.id),
		})) ?? { items: [], next_cursor: null },
		initialPageParam: null as string | null,
		getNextPageParam: last => last.next_cursor ?? undefined,
		enabled: !!asset && !!address,
		retry: (failureCount, error) => (error as ApiError)?.status !== 503 && shouldRetry(failureCount, error),
		staleTime: HISTORY_STALE_MS,
		meta: { noPersist: true },
	})
}
