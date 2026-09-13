import { View } from 'react-native'

// UI compartida con el Home: mismo héroe, misma fila de puntos, misma botonera
import BalanceHero from '../../../../ui/BalanceHero'
import BalancePagerDots from '../../../../ui/BalancePagerDots'
import { QPActionTileRow } from '../../../../ui/particles/QPActionTile'
import type { ActionTileItem } from '../../../../ui/particles/QPActionTile'

export type WalletAction = ActionTileItem

type Props = {
	total: number
	showBalance: boolean
	onToggleBalance: () => void
	loading: boolean
	actions: WalletAction[]
}

/**
 * Cabecera de la wallet self-custody. Es EL MISMO bloque que el Home
 * (BalanceHero + BalancePagerDots + QPActionTile): cifra de 60 en caja de
 * 120, la fila de puntos reservada y la botonera de 56. Cambiar el look de
 * uno es cambiar el de ambos. Tocar el total oculta/muestra con el mismo
 * ajuste `privacy.showBalance`.
 */
const WalletBalanceCard = ({ total, showBalance, onToggleBalance, loading, actions }: Props) => (
	<View>
		<BalanceHero amount={total} showBalance={showBalance} onPress={onToggleBalance} loading={loading} />
		<BalancePagerDots count={1} />
		<QPActionTileRow actions={actions} />
	</View>
)

export default WalletBalanceCard
