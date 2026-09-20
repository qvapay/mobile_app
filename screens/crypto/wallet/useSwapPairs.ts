/**
 * Pares de swap del backend (`GET /swap/pairs`) y todo lo que se deriva de ellos: qué par
 * está seleccionado, qué activo de la wallet le corresponde y si la wallet local es la que
 * el backend tiene registrada para esa red.
 *
 * Vive aparte de la pantalla porque es una unidad con sentido propio —el catálogo y su
 * selección— y porque la comprobación de dirección registrada (backend) contra la local
 * (wallet) es la que decide si el swap puede siquiera intentarse.
 */
import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { swapApi } from '../../../api/swapApi'
import { ApiError } from '../../../api/unwrap'
import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind, isHouseToken } from '../../../wallet/assets'
import type { AssetView } from '../../../wallet/assets'
import { useWalletAssets } from './walletQueries'
import { WALLET_FAMILY_BY_NETWORK } from './swapModel'
import type { SwapPair } from '../../../types/domain'

export const SWAP_PAIRS_KEY = ['swap', 'pairs']

export const useSwapPairs = () => {

	const { addresses } = useWallet()
	const { all } = useWalletAssets()
	const [pairId, setPairId] = useState<string | null>(null)

	const query = useQuery({
		queryKey: SWAP_PAIRS_KEY,
		queryFn: async () => { const r = await swapApi.getPairs(); if (!r.success) throw new ApiError(r.error ?? 'swap', r.status); if (!r.data) throw new ApiError('swap'); return r.data },
		staleTime: 30_000,
		meta: { noPersist: true },
	})

	const enabledPairs = useMemo(() => (query.data?.data ?? []).filter(p => p.enabled), [query.data])

	// Sin selección explícita gana el primer par habilitado (y si ninguno lo está, el primero)
	const pair: SwapPair | null = useMemo(() => {
		const list = query.data?.data ?? []
		return list.find(p => p.id === pairId) ?? list.find(p => p.enabled) ?? list[0] ?? null
	}, [query.data, pairId])

	const assetFor = useCallback((p: SwapPair | null): AssetView | undefined => (p ? all.find(a => a.contract === p.asset) : undefined) ?? all.find(isHouseToken), [all])
	const asset = assetFor(pair)

	// La wallet solo está lista si la dirección registrada en el backend para esa familia
	// de red es EXACTAMENTE la que tiene esta instalación (si no, el swap iría a otra wallet)
	const family = pair ? WALLET_FAMILY_BY_NETWORK[pair.network] : undefined
	const registered = family ? (query.data?.wallet as Record<string, string | null> | undefined)?.[family] ?? null : null
	const localAddress = asset && addresses ? addressForKind(addresses, asset.kind) : null

	return {
		query,
		enabledPairs,
		pair,
		asset,
		assetFor,
		setPairId,
		registered,
		walletReady: !!registered && registered === localAddress,
		limitAvailable: query.data?.limits.available ?? null,
	}
}

export default useSwapPairs
