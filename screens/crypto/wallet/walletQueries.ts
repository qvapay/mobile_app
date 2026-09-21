/**
 * Datos de la wallet self-custody en React Query, raíz `['wallet', …]`.
 *
 * Saldos: directo del teléfono a las cadenas (router de RPCs). Historial:
 * proxy de qpweb. TODO lo on-chain lleva `meta: { noPersist: true }` (regla
 * dura 5 del plan: el persister escribe AsyncStorage sin cifrar). El registry
 * (`['wallet','registry']`) sí persiste: no es dato del usuario.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'

// API
import { walletApi } from '../../../api/walletApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import type { ApiError } from '../../../api/unwrap'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { getAppRpcRouter, useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { useAssetCatalog } from './useAssetCatalog'
import { fetchAllBalances } from '../../../wallet/chains'
import type { WalletBalancesResult } from '../../../wallet/chains'
import { addressForKind, isAssetVisible, sortAssets, toAssetView, totalUsd } from '../../../wallet/assets'
import type { AssetView, AssetVisibility, PriceMap, RawBalances, WalletAsset } from '../../../wallet/assets'
import { getTronResources, TRON_TX_RPC } from '../../../wallet/tron/tx'
import type { TronResources } from '../../../wallet/tron/tx'
import { applyNewerPages, applyOlderPage, HISTORY_SYNC_MAX_PAGES, overlapsCache } from '../../../wallet/historyMerge'
import type { HistoryCache } from '../../../wallet/historyMerge'
import { loadHistoryCache, saveHistoryCache } from './historyCache'
import type { WalletHistoryPage } from '../../../types/domain'

// Settings + catálogo de monedas (precios USD)
import { useSettings } from '../../../settings/SettingsContext'
import useCoins from '../../../hooks/useCoins'

export const WALLET_BALANCES_KEY = ['wallet', 'balances']
export const WALLET_HISTORY_KEY = ['wallet', 'history']
export const WALLET_TRON_RESOURCES_KEY = ['wallet', 'tron', 'resources']

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

/** Sin ancla (primera sincronización), páginas encadenadas hasta tener esto que mostrar. */
const HISTORY_FIRST_SCREEN_ITEMS = 10

/** Frescura de los recursos TRON: cortos, porque una delegación recién comprada debe verse ya. */
const TRON_RESOURCES_STALE_MS = 15_000

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

/**
 * Energía y ancho de banda de una cuenta TRON, leídos del nodo.
 *
 * Frescura corta y `noPersist` como todo lo on-chain, pero por una razón
 * extra: una delegación de energía recién comprada tarda segundos en verse, y
 * pintar el medidor viejo tras pagar parece que el dinero se perdió.
 *
 * OJO: esto es para la PANTALLA de recursos. La pantalla de confirmar envío
 * lee los recursos de `prepared.inner.resources`, que salen del mismo nodo que
 * construyó la transacción — mezclar las dos fuentes hace parpadear el aviso
 * cuando los nodos van a alturas distintas.
 */
export const useTronResourcesQuery = (address: string | null | undefined) => {

	const isFocused = useIsFocused()

	return useQuery<TronResources>({
		queryKey: [...WALLET_TRON_RESOURCES_KEY, address ?? ''],
		queryFn: () => getAppRpcRouter().call(
			'tron',
			(rpc, signal) => getTronResources(rpc, address!, { signal }),
			{ accept: TRON_TX_RPC },
		),
		enabled: !!address,
		staleTime: TRON_RESOURCES_STALE_MS,
		refetchInterval: isFocused ? TRON_RESOURCES_STALE_MS : false,
		placeholderData: previous => previous,
		meta: { noPersist: true },
	})
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

export { useAssetCatalog } from './useAssetCatalog'

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
 * Historial de un activo en su red: DISCO + sincronización por ancla.
 *
 * - Pinta al instante desde AsyncStorage (`historyCache.ts`) y sincroniza
 *   solo lo NUEVO: pide la página más reciente y para en cuanto ve un hash
 *   ya guardado (ancla). Sin ancla (primera vez) encadena páginas hasta
 *   tener algo que mostrar o agotar el tope.
 * - `loadMore` sigue hacia lo ANTIGUO desde el cursor guardado; también se
 *   persiste. Todo va deduplicado por hash y acotado (wallet/historyMerge).
 * - Si la red falla y hay historial en disco, se muestra el de disco sin
 *   error (convención: el error solo cuando no hay nada que pintar).
 * - Cuándo se resincroniza: al cambiar el saldo del activo, tras un envío
 *   propio (con `fresh=1` al proxy), en el pull-to-refresh y cada 5 min.
 * `meta.noPersist`: la persistencia la hace historyCache, no el persister.
 */
export const useWalletHistory = (asset: WalletAsset | undefined) => {

	const { addresses } = useWallet()
	const queryClient = useQueryClient()
	const address = asset && addresses ? addressForKind(addresses, asset.kind) : null
	const assetId = asset?.id ?? ''
	const queryKey = useMemo(() => [...WALLET_HISTORY_KEY, assetId, address ?? ''], [assetId, address])

	// Copia de disco para pintar antes de que termine la primera sincronización
	const [disk, setDisk] = useState<HistoryCache | null>(null)
	useEffect(() => {
		if (!asset || !address) return
		let cancelled = false
		setDisk(null)
		loadHistoryCache(asset.id, address).then(cache => { if (!cancelled) setDisk(cache) })
		return () => { cancelled = true }
	}, [asset, address])

	const fetchPage = useCallback(async (cursor: string | null) => {
		const page = unwrap(await walletApi.getHistory({
			chain: asset!.chainKey,
			address: address!,
			asset: asset!.contract ?? 'native',
			cursor,
			fresh: isHistoryFresh(asset!.id),
		}))
		return page ?? { items: [], next_cursor: null }
	}, [asset, address])

	const query = useQuery<HistoryCache, ApiError>({
		queryKey,
		queryFn: async () => {
			const cache = queryClient.getQueryData<HistoryCache>(queryKey) ?? await loadHistoryCache(asset!.id, address!)
			const pages: WalletHistoryPage[] = []
			let cursor: string | null = null
			let collected = 0
			try {
				for (let i = 0; i < HISTORY_SYNC_MAX_PAGES; i++) {
					const page = await fetchPage(cursor)
					pages.push(page)
					collected += page.items.length
					// Ancla alcanzada, fin de datos, o (sin ancla) ya hay bastante que mostrar
					if (!page.next_cursor || overlapsCache(cache, page.items) || (cache.items.length === 0 && collected >= HISTORY_FIRST_SCREEN_ITEMS)) break
					cursor = page.next_cursor
				}
			} catch (err) {
				// Sin red pero con historial guardado: se sirve el de disco, sin error
				if (cache.items.length > 0 && pages.length === 0) return cache
				throw err
			}
			const next = applyNewerPages(cache, pages, Date.now())
			await saveHistoryCache(asset!.id, address!, next)
			return next
		},
		enabled: !!asset && !!address,
		retry: (failureCount, error) => error?.status !== 503 && shouldRetry(failureCount, error),
		staleTime: HISTORY_STALE_MS,
		placeholderData: previous => previous,
		meta: { noPersist: true },
	})

	const data = query.data ?? disk
	const [loadingMore, setLoadingMore] = useState(false)
	const loadMore = useCallback(async () => {
		const current = queryClient.getQueryData<HistoryCache>(queryKey) ?? disk
		if (!asset || !address || !current?.olderCursor || loadingMore) return
		setLoadingMore(true)
		try {
			const page = await fetchPage(current.olderCursor)
			const next = applyOlderPage(current, page, Date.now())
			queryClient.setQueryData(queryKey, next)
			await saveHistoryCache(asset.id, address, next)
		} catch { /* la lista queda donde estaba; el usuario puede volver a bajar */ }
		finally { setLoadingMore(false) }
	}, [queryClient, queryKey, disk, asset, address, loadingMore, fetchPage])

	return {
		items: data?.items ?? [],
		/** Hay más hacia lo antiguo. */
		hasMore: !!data?.olderCursor,
		loadMore,
		isLoadingMore: loadingMore,
		/** Primera carga sin nada en disco. */
		isInitialLoading: !data && query.fetchStatus === 'fetching',
		isSyncing: query.fetchStatus === 'fetching',
		isError: query.isError,
		error: query.error,
		/** Sincronizado al menos una vez o con copia de disco. */
		isReady: !!data,
		refetch: query.refetch,
	}
}
