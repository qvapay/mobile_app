/**
 * Staking de la wallet self-custody en React Query, raíz `['wallet','staking', …]`.
 *
 * Lectura directa del teléfono a la cadena (router de RPCs), `noPersist`
 * como todo lo on-chain; la copia de arranque en frío de las posiciones va
 * a disco aparte (`walletDiskCache.ts`). Una cadena que la app aún no sabe leer devuelve
 * `null` y se pinta como "sin posiciones", no como error.
 */
import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'

import { useWallet } from '../../../wallet/WalletContext'
import { getAppRpcRouter, useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { bundledRegistry } from '../../../wallet/registry/useRegistry'
import { addressForKind } from '../../../wallet/assets'
import type { WalletAsset } from '../../../wallet/assets'
import { fetchStakingSnapshot, fetchTargetApys } from '../../../wallet/staking/readers'
import { resolveStakingConfig, sortStakeTargets } from '../../../wallet/staking/config'
import { stakingCapability } from '../../../wallet/staking/capabilities'
import type { StakingSnapshot } from '../../../wallet/staking/types'
import type { RegistryStaking } from '../../../wallet/registry/types'
import type { TargetSamples } from '../../../wallet/solana/stake'
import { MAX_STAKE_SEEDS, stakeAccountFor } from '../../../wallet/solana/stake'
import { WALLET_BALANCES_KEY } from './walletQueries'
import { saveWalletQuery, useWalletQueriesPrimed } from './walletDiskCache'

export const WALLET_STAKING_KEY = ['wallet', 'staking']

/** Las posiciones cambian por epochs/ciclos, no por segundos: basta con refrescar cada minuto con la pantalla abierta. */
const STAKING_STALE_MS = 60_000

/** Config de staking de la cadena de un activo (registro efectivo con respaldo del empaquetado). */
export const useStakingConfig = (chainKey: string | undefined): RegistryStaking | null => {
	const registry = useEffectiveRegistry()
	return useMemo(() => {
		if (!chainKey) return null
		const config = resolveStakingConfig(chainKey, registry, bundledRegistry)
		return config ? { ...config, targets: sortStakeTargets(config.targets) } : null
	}, [chainKey, registry])
}

const snapshotQuery = (chainKey: string, address: string, registry: ReturnType<typeof useEffectiveRegistry>, focused: boolean, names: Record<string, string>, evm?: string) => ({
	queryKey: [...WALLET_STAKING_KEY, chainKey, address],
	queryFn: async () => {
		const snapshot = await fetchStakingSnapshot(getAppRpcRouter(), registry, chainKey, address, Date.now, names)
		saveWalletQuery(evm, [...WALLET_STAKING_KEY, chainKey, address], snapshot)
		return snapshot
	},
	enabled: !!address,
	staleTime: STAKING_STALE_MS,
	refetchInterval: focused ? STAKING_STALE_MS : false as const,
	placeholderData: (previous: StakingSnapshot | null | undefined) => previous,
	meta: { noPersist: true },
})

/** Posiciones de UN activo nativo (su cadena). */
export const useStakingSnapshot = (asset: Pick<WalletAsset, 'chainKey' | 'kind' | 'contract'> | undefined) => {
	const { addresses } = useWallet()
	const registry = useEffectiveRegistry()
	const focused = useIsFocused()
	const readable = !!asset && asset.contract === null && !!stakingCapability(asset.kind)?.read
	const address = readable && addresses ? addressForKind(addresses, asset.kind) : ''
	// A quién se delega, con nombre: los destinos del registry (validadores, SR, pools)
	const config = useStakingConfig(asset?.chainKey)
	const names = useMemo(() => Object.fromEntries((config?.targets ?? []).map(t => [t.id, t.name])), [config])
	// Posiciones de la última vez desde disco antes de leer la cadena
	const primed = useWalletQueriesPrimed(useQueryClient(), addresses?.evm)
	return useQuery<StakingSnapshot | null>({
		...snapshotQuery(asset?.chainKey ?? '', address, registry, focused, names, addresses?.evm),
		enabled: readable && !!address && primed,
	})
}

/** El APY medido cambia por epochs (~32 h): una hora de caché sobra. */
const TARGET_APY_STALE_MS = 60 * 60_000

/**
 * APY estimado de cada destino del registry (validador, SR, pool). `enabled` = el
 * selector está abierto: la lectura es pesada y no se hace por si acaso.
 */
export const useTargetApys = (chainKey: string | undefined, targets: TargetSamples[], enabled: boolean) => {
	const registry = useEffectiveRegistry()
	const sorted = useMemo(() => [...targets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), [targets])
	return useQuery<Record<string, number | null>>({
		// Las muestras van en la clave: cambiarlas en el registry vuelve a medir
		queryKey: [...WALLET_STAKING_KEY, 'apy', chainKey ?? '', sorted.map(t => `${t.id}:${(t.samples ?? []).join('+')}`).join(',')],
		queryFn: () => fetchTargetApys(getAppRpcRouter(), registry, chainKey!, sorted),
		enabled: enabled && !!chainKey && sorted.length > 0,
		staleTime: TARGET_APY_STALE_MS,
		retry: 1,
		meta: { noPersist: true },
	})
}

/** Tras cualquier acción de staking: posiciones y saldos (el gastable cambia en la misma tx). */
export const useInvalidateStaking = () => {
	const queryClient = useQueryClient()
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: WALLET_STAKING_KEY })
		queryClient.invalidateQueries({ queryKey: WALLET_BALANCES_KEY })
	}, [queryClient])
}

/**
 * Stake accounts del usuario en una cadena, para reconocer sus movimientos de staking en la
 * actividad: las de semilla QvaPay (se DERIVAN sin red: también las ya retiradas y cerradas,
 * que siguen en el historial) más las que el lector ve como posiciones (otras wallets).
 */
export const useStakeAccountSet = (asset: Pick<WalletAsset, 'chainKey' | 'kind' | 'contract'> | undefined): ReadonlySet<string> => {
	const { addresses } = useWallet()
	const snapshot = useStakingSnapshot(asset)
	const owner = asset?.kind === 'solana' && asset.contract === null && addresses ? addresses.sol : null
	const derived = useMemo(
		() => (owner ? Array.from({ length: MAX_STAKE_SEEDS }, (_, i) => stakeAccountFor(owner, i)) : []),
		[owner],
	)
	const positions = snapshot.data?.positions
	return useMemo(() => {
		if (!owner) return EMPTY_SET
		return new Set([...derived, ...(positions ?? []).map(p => p.id)])
	}, [owner, derived, positions])
}

const EMPTY_SET: ReadonlySet<string> = new Set()
