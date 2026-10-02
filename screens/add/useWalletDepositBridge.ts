import { useMemo } from 'react'

import { useWallet } from '../../wallet/WalletContext'
import { useAssetCatalog } from '../crypto/wallet/useAssetCatalog'
import { findAssetForCoin } from '../../wallet/assets'
import { roundUpToDecimals } from '../../wallet/chains/units'
import { ROUTES } from '../../routes'

import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../types/navigation'
import type { Coin } from '../../types/domain'
import type { TopupOrder } from './DepositDetailsModal'

type Args = {
	navigation: NativeStackNavigationProp<RootStackParamList>
	selectedCoin: Coin | null
	topupData: TopupOrder | null
	/** Se llama justo antes de navegar (Add cierra su modal de depósito). */
	onBeforeNavigate: () => void
}

/**
 * Puente con la wallet self-custody: si la moneda del depósito casa con un
 * activo de la wallet (misma red y token) y hay wallet respaldada, el modal
 * ofrece pagar desde ella — Enviar se abre con dirección y cantidad puestas.
 *
 * @returns El handler "pagar desde mi wallet", o `undefined` cuando no aplica.
 */
export default function useWalletDepositBridge({ navigation, selectedCoin, topupData, onBeforeNavigate }: Args) {

	const { hasWallet, isBackedUp } = useWallet()
	const assetCatalog = useAssetCatalog()
	const walletAsset = useMemo(() => (selectedCoin ? findAssetForCoin(assetCatalog, selectedCoin) : null), [assetCatalog, selectedCoin])

	if (!hasWallet || !isBackedUp || !walletAsset || !topupData?.wallet || topupData.value == null) { return undefined }

	return () => {
		onBeforeNavigate()
		// Nunca por debajo de lo pedido: el backend acredita solo el importe exacto
		const value = roundUpToDecimals(String(topupData.value), walletAsset.decimals)
		navigation.navigate(ROUTES.WALLET_SEND_CONFIRM, { assetId: walletAsset.id, to: topupData.wallet as string, amount: value })
	}
}
