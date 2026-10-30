/**
 * Veredicto sobre el destino de un envío (`wallet/recipients.ts`) con el historial que la
 * wallet ya guarda en disco: el de CADA activo de la misma familia de direcciones (una EVM es
 * la misma en Ethereum, BSC y Base). Es justo el historial del que el usuario copia una
 * dirección, y donde el address poisoning deja la suya.
 *
 * null mientras se lee el disco (milisegundos): la pantalla no deja confirmar sin veredicto.
 */
import { useEffect, useMemo, useState } from 'react'

import { useWallet } from '../../../wallet/WalletContext'
import { addressForKind, assetPrice } from '../../../wallet/assets'
import type { WalletAsset } from '../../../wallet/assets'
import { checkRecipient } from '../../../wallet/recipients'
import type { RecipientVerdict } from '../../../wallet/recipients'
import type { WalletTx } from '../../../types/domain'
import { loadHistoryCache } from './historyCache'
import { usePriceMap, useWalletAssets } from './walletQueries'

export const useRecipientCheck = (asset: WalletAsset | undefined, to: string): RecipientVerdict | null => {

	const { addresses } = useWallet()
	const { all } = useWalletAssets()
	const prices = usePriceMap()
	const kind = asset?.kind
	const own = asset && addresses ? addressForKind(addresses, asset.kind) : null

	const family = useMemo(() => (kind ? all.filter(a => a.kind === kind) : []), [all, kind])
	// Los saldos recrean la lista de activos: el disco solo se relee si cambian los activos
	const familyIds = family.map(a => a.id).join(',')

	const [items, setItems] = useState<{ key: string, byAsset: Record<string, WalletTx[]> } | null>(null)
	const loadKey = own ? `${own}|${familyIds}` : null

	useEffect(() => {
		if (!own || !loadKey) return
		let cancelled = false
		const ids = familyIds.split(',').filter(Boolean)
		Promise.all(ids.map(async id => [id, (await loadHistoryCache(id, own)).items] as const))
			.then(loaded => { if (!cancelled) setItems({ key: loadKey, byAsset: Object.fromEntries(loaded) }) })
		return () => { cancelled = true }
	}, [own, familyIds, loadKey])

	return useMemo(() => {
		// Lo leído para otra dirección u otros activos no vale para esta
		if (!kind || !own || !items || items.key !== loadKey) return null
		const histories = family.map(a => ({ items: items.byAsset[a.id] ?? [], priceUsd: assetPrice(a, prices) }))
		return checkRecipient({ kind, to, own: [own], histories })
	}, [kind, own, items, loadKey, family, prices, to])
}

export default useRecipientCheck
