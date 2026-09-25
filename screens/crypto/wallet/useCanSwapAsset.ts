import { useMemo } from 'react'

// Datos
import useCoins from '../../../hooks/useCoins'
import { useExchangeCatalogQuery } from './exchangeQueries'
import { useAssetCatalog } from './useAssetCatalog'

// Wallet
import { findAssetForCoin, isHouseToken } from '../../../wallet/assets'
import type { WalletAsset } from '../../../wallet/assets'
import { canSwapAsset } from './swapRouting'

/**
 * ¿Este activo tiene alguna salida de intercambio?
 *
 * Junta las tres fuentes que pueden dársela —el par custodial, lo que lista el proveedor y
 * los rieles de depósito/retiro de QvaPay— y deja la decisión en `canSwapAsset`, que es puro.
 *
 * Las tres queries son compartidas (`['coins', …]` y `['exchange','catalog']`), así que
 * preguntarlas desde la pantalla de un activo no añade ni una petición: React Query las
 * deduplica con las que ya tiene la wallet abierta.
 */
export const useCanSwapAsset = (asset: WalletAsset | null | undefined): boolean => {

	const catalog = useExchangeCatalogQuery()
	const { coins } = useCoins('all')
	const assets = useAssetCatalog()

	const railAssetIds = useMemo(
		() => coins.map(coin => findAssetForCoin(assets, coin)?.id).filter((id): id is string => !!id),
		[coins, assets],
	)

	return useMemo(() => {
		if (!asset) { return false }
		return canSwapAsset({
			assetId: asset.id,
			isHouse: isHouseToken(asset),
			supportedAssetIds: catalog.data?.supported ?? [],
			railAssetIds,
		})
	}, [asset, catalog.data, railAssetIds])
}

export default useCanSwapAsset
