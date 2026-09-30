import { View, StyleSheet } from 'react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'

type QPCheckboxProps = {
	checked: boolean
	size?: number
	/** Color del relleno marcado (default `primary`). */
	color?: string
	style?: StyleProp<ViewStyle>
}

/**
 * Casilla visual (squircle): marcada = relleno de color + check blanco,
 * sin marcar = solo borde. Es PRESENTACIONAL: el toque y la semántica de
 * accesibilidad (`accessibilityRole="checkbox"` + `accessibilityState`) los
 * lleva la fila que la contiene, para que toda la fila sea área de toque.
 *
 * @param props
 * @param props.checked - Estado.
 * @param [props.size=22] - Lado en px.
 * @param [props.color] - Relleno marcado.
 */
const QPCheckbox = ({ checked, size = 22, color, style }: QPCheckboxProps) => {

	const { theme } = useTheme()
	const fill = color || theme.colors.primary

	return (
		<View
			style={[
				styles.box,
				{ width: size, height: size, borderRadius: Math.round(size * 0.3) },
				checked ? { backgroundColor: fill, borderColor: fill } : { borderColor: theme.colors.secondaryText },
				style,
			]}
		>
			{checked && <FontAwesome6 name="check" size={Math.round(size * 0.55)} color={theme.colors.almostWhite} iconStyle="solid" />}
		</View>
	)
}

const styles = StyleSheet.create({
	box: {
		borderWidth: 1.5,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default QPCheckbox
