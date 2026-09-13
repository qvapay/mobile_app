/**
 * Datos de la wallet self-custody en React Query, raíz `['wallet', …]`.
 *
 * Saldos: directo del teléfono a las cadenas (router de RPCs). Historial:
 * proxy de qpweb. TODO lo on-chain lleva `meta: { noPersist: true }` (regla
 * dura 5 del plan: el persister escribe AsyncStorage sin cifrar). El registry
 * (`['wallet','registry']`) sí persiste: no es dato del usuario.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { AppState } from 'react-native'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
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
import type { AssetView, AssetVisibility, PriceMap, WalletAsset } from '../../../wallet/assets'

// Settings + catálogo de monedas (precios USD)
import { useSettings } from '../../../settings/SettingsContext'
import useCoins from '../../../hooks/useCoins'

export const WALLET_BALANCES_KEY = ['wallet', 'balances']
export const WALLET_HISTORY_KEY = ['wallet', 'history']

/** Frescura de saldos: un depósito entrante debe verse en < 60s con la pantalla abierta. */
const BALANCES_STALE_MS = 30_000

const NO_PREFS: AssetVisibility = {}

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
 * Historial paginado de un activo en su red (proxy qpweb). Sin reintentos en
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
		})) ?? { items: [], next_cursor: null },
		initialPageParam: null as string | null,
		getNextPageParam: last => last.next_cursor ?? undefined,
		enabled: !!asset && !!address,
		retry: (failureCount, error) => (error as ApiError)?.status !== 503 && shouldRetry(failureCount, error),
		staleTime: BALANCES_STALE_MS,
		meta: { noPersist: true },
	})
}
