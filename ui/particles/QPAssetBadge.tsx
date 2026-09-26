import { Image, StyleSheet, View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// UI
import QPAssetIcon from './QPAssetIcon'

/** Qué pinta el icono: el saldo QvaPay (marca) o un activo/moneda con su red. */
export type QPAssetIconKind = { kind: 'balance' } | { kind: 'wallet', logoTick: string, networkTick: string | null }

/**
 * Icono de un activo: isotipo de QvaPay para el saldo custodial, logo con badge de red
 * para todo lo demás. El badge es lo que evita confundir USDT de TRON con el de BNB Chain.
 */
const QPAssetBadge = ({ icon, size = 28, ringColor }: { icon: QPAssetIconKind, size?: number, ringColor?: string }) => {

	const { theme } = useTheme()

	if (icon.kind === 'wallet') return <QPAssetIcon logoTick={icon.logoTick} networkTick={icon.networkTick} size={size} ringColor={ringColor} />
	return (
		<View style={[styles.brand, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primary }]}>
			<Image source={require('../../assets/images/ui/qvapay-logo-white.png')} style={{ width: size * 0.58, height: size * 0.58 }} resizeMode="contain" />
		</View>
	)
}

const styles = StyleSheet.create({
	brand: { alignItems: 'center', justifyContent: 'center' },
})

export default QPAssetBadge
