import { StyleSheet, View } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// UI
import QPCoin from './QPCoin'

type Props = {
	logoTick: string
	/** Tick de la red para el badge; se omite cuando coincide con la moneda (BTC en Bitcoin). */
	networkTick?: string | null
	size?: number
	/** Color del aro del badge = fondo sobre el que va el icono (por defecto, las cards `surface`). */
	ringColor?: string
}

/**
 * Logo de un activo con el badge de su red abajo a la derecha (patrón
 * Trust/SafePal): USDT de TRON y USDT de BNB Chain comparten logo, el badge es
 * lo que evita mandar fondos a la red equivocada.
 */
const QPAssetIcon = ({ logoTick, networkTick, size = 40, ringColor }: Props) => {

	const { theme } = useTheme()
	const badge = Math.round(size * 0.42)
	const showBadge = !!networkTick && networkTick !== logoTick

	return (
		<View style={{ width: size, height: size }}>
			<QPCoin coin={logoTick} size={size} />
			{showBadge && (
				<View
					style={[
						styles.badge,
						{
							width: badge + 4,
							height: badge + 4,
							borderRadius: (badge + 4) / 2,
							backgroundColor: ringColor ?? theme.colors.surface,
						},
					]}
				>
					<QPCoin coin={networkTick} size={badge} />
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	badge: { position: 'absolute', right: -3, bottom: -3, alignItems: 'center', justifyContent: 'center' },
})

export default QPAssetIcon
