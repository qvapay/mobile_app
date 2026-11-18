/**
 * Datos de la wallet self-custody en React Query, raíz `['wallet', …]`.
 *
 * Saldos: directo del teléfono a las cadenas (router de RPCs). Historial:
 * proxy de qpweb. TODO lo on-chain lleva `meta: { noPersist: true }`: el
 * persister de React Query no lo escribe. Su copia de arranque en frío va a
 * disco por su cuenta — saldos/staking en `walletDiskCache.ts`, historial en
 * `historyCache.ts`. El registry (`['wallet','registry']`) sí persiste.
 */
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'

// API
import { walletApi } from '../../../api/walletApi'
import { shouldRetry, unwrap } from '../../../api/unwrap'
import type { ApiError } from '../../../api/unwrap'

// Wallet
import { useWallet } from '../../../wallet/WalletContext'
import { getAppRpcRouter, useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { useAssetCatalog } from './useAssetCatalog'
import { fetchAllBalances, fetchAssetBalance, fetchChainBalances, fetchSlowBalances, mergeBalances } from '../../../wallet/chains'
import type { WalletBalancesResult } from '../../../wallet/chains'
import type { WalletAddresses } from '../../../wallet/derive'
import { applyBalances, balanceIncrease, chaseBalance } from './balanceUpdates'
import type { BalanceSample, BalanceStore } from './balanceUpdates'
import { addressForKind, isAssetVisible, sortAssets, toAssetView, tokenAssetId, totalUsd } from '../../../wallet/assets'
import type { AssetOrder, AssetView, AssetVisibility, PriceMap, RawBalances, WalletAsset } from '../../../wallet/assets'
import { getTronChainParams, getTronResources, TRON_TX_RPC } from '../../../wallet/tron/tx'
import type { TronChainParams, TronResources } from '../../../wallet/tron/tx'
import { getTronAccountControl } from '../../../wallet/tron/control'
import type { TronControl } from '../../../wallet/tron/control'
import { applyNewerPages, applyOlderPage, HISTORY_SYNC_MAX_PAGES, overlapsCache } from '../../../wallet/historyMerge'
import type { HistoryCache } from '../../../wallet/historyMerge'
import { loadHistoryCache, saveHistoryCache } from './historyCache'
import { saveWalletQuery, useWalletQueriesPrimed } from './walletDiskCache'
import type { WalletHistoryPage } from '../../../types/domain'

// Settings + catálogo de monedas (precios USD)
import { useSettings } from '../../../settings/SettingsContext'
import useCoins from '../../../hooks/useCoins'

// Acciones tokenizadas (precios de Jupiter)
import { useXStockQuotes } from '../stocks/xstocksPrices'
import { XSTOCKS, XSTOCKS_CHAIN, xStockPriceTick } from '../../../wallet/xstocks'

export const WALLET_BALANCES_KEY = ['wallet', 'balances']
export const WALLET_HISTORY_KEY = ['wallet', 'history']
export const WALLET_TRON_RESOURCES_KEY = ['wallet', 'tron', 'resources']
export const WALLET_TRON_PARAMS_KEY = ['wallet', 'tron', 'params']
export const WALLET_TRON_CONTROL_KEY = ['wallet', 'tron', 'control']
/** Lo que tarda segundos en leerse y por eso no va en la pasada de saldos (`fetchSlowBalances`). */
export const WALLET_SLOW_BALANCES_KEY = ['wallet', 'slow-balances']

/** Frescura de saldos: un depósito entrante debe verse en < 60s con la pantalla abierta. */
const BALANCES_STALE_MS = 30_000

/** Lo lento cambia de tarde en tarde (stake accounts creadas con otra wallet): diez minutos sobran. */
const SLOW_BALANCES_STALE_MS = 10 * 60_000

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
const NO_ORDER: AssetOrder = []

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

const balancesKeyOf = (addresses: WalletAddresses | null | undefined): QueryKey =>
	[...WALLET_BALANCES_KEY, addresses?.evm ?? '', addresses?.tron ?? '', addresses?.btc ?? '']

/** La caché de saldos de una wallet, como la ven las reglas puras de `balanceUpdates`. */
const balanceStore = (queryClient: QueryClient, queryKey: QueryKey): BalanceStore => ({
	id: JSON.stringify(queryKey),
	get: () => queryClient.getQueryData<WalletBalancesResult>(queryKey),
	set: next => { queryClient.setQueryData<WalletBalancesResult>(queryKey, next) },
})

/**
 * Saldos crudos de todas las cadenas. Refresca cada 30s SOLO con la pantalla
 * enfocada y al volver la app a foreground; una cadena caída conserva sus
 * saldos previos (ver `fetchAllBalances`).
 *
 * Cada red se pinta en cuanto contesta, sin esperar a las demás, y lo que tarda segundos en
 * leerse va en una consulta aparte (`fetchSlowBalances`). Antes la pasada entera esperaba
 * 6,5 s a una búsqueda de Solana y hasta entonces no se movía ningún saldo, tampoco al tirar
 * para refrescar.
 */
export const useWalletBalancesQuery = () => {

	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const queryClient = useQueryClient()
	const isFocused = useIsFocused()
	// La foto de disco se siembra ANTES de pedir: pinta al instante y además
	// sirve de `previous` a fetchAllBalances (una cadena caída conserva lo último)
	const primed = useWalletQueriesPrimed(queryClient, addresses?.evm)

	const queryKey = useMemo(() => balancesKeyOf(addresses), [addresses])
	const slowKey = useMemo(() => [...WALLET_SLOW_BALANCES_KEY, addresses?.sol ?? ''], [addresses])

	const query = useQuery({
		queryKey,
		queryFn: async () => {
			const store = balanceStore(queryClient, queryKey)
			const startedAt = Date.now()
			const result = await fetchAllBalances(
				getAppRpcRouter(),
				registry,
				addresses!,
				store.get(),
				undefined,
				(_chainKey, chainBalances) => { applyBalances(store, chainBalances, { startedAt }) },
			)
			// Con foto previa manda lo pintado por el camino: ya trae cada red de esta pasada,
			// salvo la que una lectura más nueva (la de un envío propio) dejó atrás. Sin foto
			// vale el resultado entero. La parte lenta entra aunque llegara antes que la foto
			const painted = store.get()
			const final: WalletBalancesResult = {
				balances: mergeBalances(painted?.balances ?? result.balances, queryClient.getQueryData<RawBalances>(slowKey) ?? {}),
				failedChains: result.failedChains,
				updatedAt: result.updatedAt,
			}
			// A disco sin `failedChains`: al arrancar no hay pasada que haya fallado aún
			saveWalletQuery(addresses?.evm, queryKey, { ...final, failedChains: [] })
			return final
		},
		enabled: !!addresses && primed,
		staleTime: BALANCES_STALE_MS,
		refetchInterval: isFocused ? BALANCES_STALE_MS : false,
		placeholderData: previous => previous,
		meta: { noPersist: true },
	})

	// Lo lento, aparte y de tarde en tarde: su resultado se funde en los saldos al llegar
	useQuery({
		queryKey: slowKey,
		queryFn: async () => {
			const slow = await fetchSlowBalances(getAppRpcRouter(), registry, addresses!)
			applyBalances(balanceStore(queryClient, queryKey), slow)
			return slow
		},
		enabled: !!addresses && primed,
		staleTime: SLOW_BALANCES_STALE_MS,
		refetchInterval: isFocused ? SLOW_BALANCES_STALE_MS : false,
		retry: 1,
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
 * Tras un envío propio: relee SOLO su red, a los pocos segundos y hasta ver moverse el saldo
 * del activo enviado (`CHASE_DELAYS_MS`). Antes se invalidaban todos los saldos en el segundo
 * 0: ocho redes para leer el saldo de antes, porque ninguna había confirmado aún, y el nuevo
 * no aparecía hasta el sondeo siguiente.
 */
export const useBalanceChase = () => {
	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const queryClient = useQueryClient()
	return useCallback((chainKey: string, assetId: string): void => {
		if (!addresses || !registry.chains[chainKey]) return
		const store = balanceStore(queryClient, balancesKeyOf(addresses))
		chaseBalance(`${store.id}|${chainKey}`, {
			baseline: store.get()?.balances[assetId],
			read: async () => {
				const startedAt = Date.now()
				const chainBalances = await fetchChainBalances(getAppRpcRouter(), registry, chainKey, addresses)
				applyBalances(store, chainBalances, { startedAt })
				return chainBalances[assetId]
			},
		})
	}, [addresses, registry, queryClient])
}

/** Cada cuánto se relee el activo que el usuario está mirando, o por el que espera un cobro. */
const ASSET_WATCH_MS = 5_000

/**
 * Sondeo rápido de UN activo mientras su pantalla está delante (Recibir y el detalle del
 * activo). Quien espera un cobro lo ve a los pocos segundos del bloque en vez de cuando toque
 * la pasada de 30 s. Es una llamada por lectura y solo a la red de ese activo
 * (`fetchAssetBalance`); se para al salir de la pantalla y con la app en segundo plano.
 */
export const useAssetBalanceWatch = (asset: Pick<WalletAsset, 'chainKey' | 'contract'> | undefined): void => {
	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const queryClient = useQueryClient()
	const isFocused = useIsFocused()
	const chainKey = asset?.chainKey
	const contract = asset ? asset.contract : undefined

	useEffect(() => {
		if (!chainKey || contract === undefined || !addresses || !isFocused || !registry.chains[chainKey]) return
		const store = balanceStore(queryClient, balancesKeyOf(addresses))
		let reading = false
		let foreground = AppState.currentState === 'active'
		const read = async () => {
			// Sin solaparse: un nodo lento no acumula lecturas
			if (reading || !foreground) return
			reading = true
			const startedAt = Date.now()
			try {
				applyBalances(store, await fetchAssetBalance(getAppRpcRouter(), registry, chainKey, contract, addresses), { startedAt })
			} catch { /* la siguiente lo vuelve a intentar */ } finally { reading = false }
		}
		const timer = setInterval(read, ASSET_WATCH_MS)
		const sub = AppState.addEventListener('change', state => { foreground = state === 'active' })
		return () => { clearInterval(timer); sub.remove() }
	}, [chainKey, contract, addresses, registry, queryClient, isFocused])
}

/** El saldo crudo de un activo según la caché, sin activar ni refrescar la consulta de saldos. */
const useCachedRawBalance = (assetId: string | undefined): string | undefined => {
	const { addresses } = useWallet()
	const cache = useQueryClient().getQueryCache()
	const queryKey = useMemo(() => balancesKeyOf(addresses), [addresses])
	const subscribe = useCallback((onChange: () => void) => cache.subscribe(event => {
		const [root, kind] = event.query.queryKey
		if (root === WALLET_BALANCES_KEY[0] && kind === WALLET_BALANCES_KEY[1]) onChange()
	}), [cache])
	const read = useCallback(
		() => (assetId ? (cache.find({ queryKey })?.state.data as WalletBalancesResult | undefined)?.balances[assetId] : undefined),
		[cache, queryKey, assetId],
	)
	return useSyncExternalStore(subscribe, read)
}

/**
 * Avisa cuando el saldo de un activo SUBE con la pantalla montada. Es para Recibir, donde no
 * hay saldo a la vista: sin esto el cobro llegaba y no se enteraba nadie. La primera lectura
 * solo fija el punto de partida, y cambiar de activo también.
 */
export const useIncomingBalance = (asset: Pick<WalletAsset, 'id'> | undefined, onIncrease: (units: bigint) => void): void => {
	const assetId = asset?.id
	const raw = useCachedRawBalance(assetId)
	const last = useRef<BalanceSample | null>(null)
	const notify = useEffectEvent(onIncrease)
	useEffect(() => {
		if (!assetId || raw === undefined) return
		const sample = { id: assetId, raw }
		const increase = balanceIncrease(last.current, sample)
		last.current = sample
		if (increase > 0n) notify(increase)
	}, [assetId, raw])
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

/**
 * Precios de la red TRON (sun por energía y por byte). Cambian por votación de los SR, muy
 * de tarde en tarde: con una hora de caché sobra. `getTronChainParams` nunca rechaza (cae a
 * sus defaults), así que esto siempre acaba con datos.
 */
export const useTronChainParamsQuery = (enabled: boolean) => useQuery<TronChainParams>({
	queryKey: WALLET_TRON_PARAMS_KEY,
	queryFn: () => getAppRpcRouter().call('tron', (rpc, signal) => getTronChainParams(rpc, { signal }), { accept: TRON_TX_RPC }),
	enabled,
	staleTime: 60 * 60_000,
	// bigint no sobrevive al JSON del persister
	meta: { noPersist: true },
})

/**
 * ¿Controla la frase su cuenta TRON? (ver `wallet/tron/control.ts`). Los permisos casi
 * nunca cambian: 10 min de frescura. Falla en ABIERTO a propósito: con el nodo caído no
 * hay aviso, pero tampoco se bloquea TRON a todo el mundo — y una cuenta ajena no podría
 * firmar de todos modos.
 */
export const useTronControlQuery = () => {
	const { addresses } = useWallet()
	const address = addresses?.tron ?? null
	return useQuery<TronControl>({
		queryKey: [...WALLET_TRON_CONTROL_KEY, address ?? ''],
		queryFn: () => getAppRpcRouter().call('tron', (rpc, signal) => getTronAccountControl(rpc, address!, { signal }), { accept: TRON_TX_RPC, idempotent: true }),
		enabled: !!address,
		staleTime: 10 * 60_000,
		meta: { noPersist: true },
	})
}

/** Quién controla la cuenta TRON cuando NO es la frase; null si es propia o aún no se sabe. */
export const useTronForeignControl = (): string[] | null => {
	const { data } = useTronControlQuery()
	return data && !data.controlled ? data.controllers : null
}

const XSTOCK_ASSET_IDS = XSTOCKS.map(stock => tokenAssetId(XSTOCKS_CHAIN, stock.mint))

const holdsXStock = (result: WalletBalancesResult | undefined): boolean =>
	!!result && XSTOCK_ASSET_IDS.some(id => { const raw = result.balances[id]; return !!raw && raw !== '0' })

/**
 * ¿Hay alguna acción tokenizada con saldo en los saldos ya leídos? Mira la CACHÉ de saldos
 * sin observar la query: no la activa ni la refresca en pantallas que no la piden.
 */
export const useHoldsXStocks = (): boolean => {
	const cache = useQueryClient().getQueryCache()
	const subscribe = useCallback((onChange: () => void) => cache.subscribe(event => {
		const [root, kind] = event.query.queryKey
		if (root === WALLET_BALANCES_KEY[0] && kind === WALLET_BALANCES_KEY[1]) onChange()
	}), [cache])
	const read = useCallback(
		() => cache.findAll({ queryKey: WALLET_BALANCES_KEY }).some(query => holdsXStock(query.state.data as WalletBalancesResult | undefined)),
		[cache],
	)
	return useSyncExternalStore(subscribe, read)
}

/** Precio USD por tick del catálogo de QvaPay (misma query `['coins','all']` que el resto de la app). */
export const usePriceMap = (): PriceMap => {
	const { coins } = useCoins('all')
	// Acciones tokenizadas: precio por unidad CRUDA (ver xstocksModel), con la clave `xstock:<mint>`.
	// Solo se cotizan si hay alguna: si no, cada pantalla de la wallet sondearía Jupiter cada 20 s
	const { quotes } = useXStockQuotes({ enabled: useHoldsXStocks() })
	return useMemo(() => {
		const map: PriceMap = {}
		coins.forEach(coin => {
			const price = Number(coin.price)
			if (Number.isFinite(price) && price > 0) map[coin.tick] = price
		})
		Object.entries(quotes).forEach(([mint, quote]) => { if (quote) map[xStockPriceTick(mint)] = quote.rawPrice })
		return map
	}, [coins, quotes])
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
	const { addresses } = useWallet()
	const primed = useWalletQueriesPrimed(useQueryClient(), addresses?.evm)
	const { getSetting, updateSetting } = useSettings()
	const prefs = getSetting('crypto', 'visibleAssets', NO_PREFS) as AssetVisibility
	const order = getSetting('crypto', 'assetOrder', NO_ORDER) as AssetOrder

	const balances = balancesQuery.data?.balances
	const all = useMemo<AssetView[]>(
		() => catalog.map(asset => toAssetView(asset, balances ?? {}, prices)),
		[catalog, balances, prices],
	)
	const visible = useMemo(() => sortAssets(all.filter(view => isAssetVisible(view, prefs)), order), [all, prefs, order])
	// El total es el de lo que se VE (como Trust/SafePal): ocultar un activo lo saca de la suma
	const total = useMemo(() => totalUsd(visible), [visible])

	const setAssetVisible = useCallback((id: string, value: boolean) => {
		updateSetting('crypto', 'visibleAssets', { ...prefs, [id]: value })
	}, [prefs, updateSetting])

	/** Orden manual (ids); `[]` vuelve al automático por valor. */
	const setAssetOrder = useCallback((next: AssetOrder) => {
		updateSetting('crypto', 'assetOrder', next)
	}, [updateSetting])

	return {
		all,
		visible,
		prefs,
		total,
		setAssetVisible,
		/** Orden manual vigente (vacío = automático). */
		order,
		setAssetOrder,
		/** Sin saldos todavía (ni de disco ni de la pasada anterior): la UI pinta skeleton. */
		isLoading: !balances && balancesQuery.fetchStatus === 'fetching',
		/** Aún leyendo la foto de disco (milisegundos): mejor no pintar nada que un skeleton de un frame. */
		isHydrating: !primed,
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
	// El proxy de historial es PÚBLICO desde 2026-10-01 (sin sesión, límite por IP): el modo
	// wallet también tiene actividad. Contra un qpweb anterior responde 401 y la pantalla
	// vuelve a ofrecer crear la cuenta (ver WalletAsset)
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
		/**
		 * Primera sincronización sin nada guardado. Mientras se LEE el disco no
		 * cuenta (sería un skeleton de un frame), y una copia de disco VACÍA
		 * tampoco es "lista": pintaría "sin actividad" antes de preguntar.
		 */
		isInitialLoading: !query.data && !!disk && disk.items.length === 0 && query.fetchStatus === 'fetching',
		isSyncing: query.fetchStatus === 'fetching',
		isError: query.isError,
		error: query.error,
		/** Sincronizado al menos una vez o con movimientos en disco. */
		isReady: !!query.data || (!!disk && disk.items.length > 0),
		refetch: query.refetch,
	}
}
