import { Image, StyleSheet, View } from 'react-native'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'

// UI
import AssetIcon from '../AssetIcon'

/** Qué pinta el icono de un lado del swap: el saldo QvaPay (marca) o un activo de la wallet. */
export type SwapTokenIcon = { kind: 'balance' } | { kind: 'wallet', logoTick: string, networkTick: string | null }

/** Icono de un lado del swap: isotipo de QvaPay para el saldo, logo + badge de red para la wallet. */
const SwapTokenBadge = ({ icon, size = 28, ringColor }: { icon: SwapTokenIcon, size?: number, ringColor?: string }) => {

	const { theme } = useTheme()

	if (icon.kind === 'wallet') return <AssetIcon logoTick={icon.logoTick} networkTick={icon.networkTick} size={size} ringColor={ringColor} />
	return (
		<View style={[styles.brand, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.primary }]}>
			<Image source={require('../../../../../assets/images/ui/qvapay-logo-white.png')} style={{ width: size * 0.58, height: size * 0.58 }} resizeMode="contain" />
		</View>
	)
}

const styles = StyleSheet.create({
	brand: { alignItems: 'center', justifyContent: 'center' },
})

export default SwapTokenBadge
