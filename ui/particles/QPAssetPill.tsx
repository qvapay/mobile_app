import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

// UI
import QPAssetBadge from './QPAssetBadge'
import type { QPAssetIconKind } from './QPAssetBadge'
import QPPressable from './QPPressable'

/**
 * La píldora de activo: icono con su badge de red, símbolo, y galón cuando se puede cambiar.
 *
 * Nació en la tarjeta del swap y vive aquí porque la quieren también el retiro y el
 * depósito: que la misma moneda se vea igual en las tres pantallas es la mitad del trabajo
 * de que se entienda. El fondo es el de la PANTALLA, no el de la tarjeta, así que la
 * píldora se lee como un hueco recortado sobre la superficie.
 */
const QPAssetPill = ({ icon, symbol, placeholder, onPress, disabled = false }: {
	/** null = aún no hay activo elegido; se pinta el placeholder. */
	icon: QPAssetIconKind | null
	symbol?: string
	/** Texto cuando no hay activo ("Elegir moneda"). */
	placeholder?: string
	/** Sin handler no hay galón: la píldora informa en vez de invitar a tocarla. */
	onPress?: () => void
	disabled?: boolean
}) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const body = (
		<View style={[styles.pill, { backgroundColor: theme.colors.background }]}>
			{!!icon && <QPAssetBadge icon={icon} size={26} ringColor={theme.colors.background} />}
			<Text style={[textStyles.h4, { color: symbol ? theme.colors.primaryText : theme.colors.tertiaryText }]} numberOfLines={1}>
				{symbol || placeholder}
			</Text>
			{!!onPress && <FontAwesome6 name="chevron-down" size={11} color={theme.colors.secondaryText} iconStyle="solid" />}
		</View>
	)

	if (!onPress) { return body }
	return (
		<QPPressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={symbol || placeholder}>
			{body}
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	// Asimétrica a propósito: el icono ya trae su propio aire por la izquierda
	pill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 5, paddingRight: 11, paddingVertical: 5, borderRadius: 20, borderCurve: 'continuous' },
})

export default QPAssetPill
