import { StyleSheet, Switch, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'

// Theme
import { useTheme } from '../../theme/ThemeContext'
import { createTextStyles, createContainerStyles } from '../../theme/themeUtils'

// Icons
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

type Props = {
	title: string
	/** Línea secundaria bajo el título (p. ej. "Beta"). */
	subtitle?: string
	icon?: FontAwesome6SolidIconName
	color?: string
	value: boolean
	onValueChange: (value: boolean) => void
	disabled?: boolean
	/** Posición dentro del grupo: solo las esquinas exteriores se redondean (como SettingsItem). */
	index?: number
	totalItems?: number
	style?: ViewStyle
}

/**
 * Fila del menú de Ajustes con un Switch en vez de navegar: misma anatomía
 * que SettingsItem (tile de icono tintado + título + esquinas solo en los
 * extremos del grupo) para que conviva en la misma SettingsSection. Se usa
 * para flags locales sin pantalla propia (wallet self-custody).
 */
const SettingsToggleRow = ({ title, subtitle, icon, color, value, onValueChange, disabled, index = 0, totalItems = 1, style }: Props) => {

	const { theme } = useTheme()
	const textStyles = createTextStyles(theme)
	const containerStyles = createContainerStyles(theme)
	const tint = color || theme.colors.primary

	const isFirst = index === 0
	const isLast = index === totalItems - 1
	const cornerStyle: ViewStyle = {
		borderTopLeftRadius: isFirst ? 12 : 0,
		borderTopRightRadius: isFirst ? 12 : 0,
		borderBottomLeftRadius: isLast ? 12 : 0,
		borderBottomRightRadius: isLast ? 12 : 0,
		marginBottom: isLast ? 10 : 0,
	}

	return (
		<View style={[containerStyles.box, styles.row, cornerStyle, disabled && styles.disabled, style]}>
			<View style={styles.leading}>
				{icon && (
					<View style={[styles.iconTile, { backgroundColor: tint + '1F' }]}>
						<FontAwesome6 name={icon} size={14} color={tint} iconStyle="solid" />
					</View>
				)}
				<View style={styles.texts}>
					<Text numberOfLines={1} style={[textStyles.h4, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.regular }]}>{title}</Text>
					{subtitle && <Text numberOfLines={1} style={[textStyles.h7, { color: theme.colors.secondaryText }]}>{subtitle}</Text>}
				</View>
			</View>
			<Switch
				value={value}
				onValueChange={onValueChange}
				disabled={disabled}
				trackColor={{ false: theme.colors.tertiaryText, true: theme.colors.primary }}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	row: {
		justifyContent: 'space-between',
		borderCurve: 'continuous',
		paddingVertical: 8,
	},
	disabled: { opacity: 0.5 },
	leading: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		flexShrink: 1,
		paddingRight: 8,
	},
	texts: { flexShrink: 1, gap: 1 },
	iconTile: {
		width: 30,
		height: 30,
		borderRadius: 9,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default SettingsToggleRow
