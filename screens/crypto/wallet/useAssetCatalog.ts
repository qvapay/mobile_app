import { useMemo } from 'react'

import { useEffectiveRegistry } from '../../../wallet/registry/appRpcRouter'
import { buildAssetCatalog } from '../../../wallet/assets'
import type { WalletAsset } from '../../../wallet/assets'

/**
 * Catálogo completo del registro efectivo (remoto/bundled + nodos custom).
 * Módulo aparte de walletQueries a propósito: lo consumen pantallas ajenas a
 * la wallet (Add, el puente de depósito) sin arrastrar navegación ni saldos.
 */
export const useAssetCatalog = (): WalletAsset[] => {
	const registry = useEffectiveRegistry()
	return useMemo(() => buildAssetCatalog(registry), [registry])
}

export default useAssetCatalog
