import { Text, Pressable, StyleSheet } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../theme/ThemeContext'
import { useTextStyles } from '../../theme/themeUtils'

/** Iconos sólidos de los menús de mini-app; `star-outline` = la estrella sin rellenar. */
export type MiniAppMenuIcon = 'share-nodes' | 'rotate-right' | 'arrow-up-right-from-square' | 'user-slash' | 'mobile-screen-button' | 'star' | 'star-outline'

type MiniAppMenuRowProps = {
	icon: MiniAppMenuIcon
	label: string
	onPress: () => void
	danger?: boolean
	/** Color propio del icono (la estrella de favorita); el texto no cambia. */
	iconColor?: string
	testID?: string
}

/** Fila de los menús de mini-app (⋯ del host y long-press del Home y del catálogo). */
const MiniAppMenuRow = ({ icon, label, onPress, danger = false, iconColor, testID }: MiniAppMenuRowProps) => {
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const color = danger ? theme.colors.danger : theme.colors.primaryText
	return (
		<Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID={testID}>
			{icon === 'star-outline'
				? <FontAwesome6 name="star" size={16} color={iconColor ?? color} iconStyle="regular" style={styles.icon} />
				: <FontAwesome6 name={icon} size={16} color={iconColor ?? color} iconStyle="solid" style={styles.icon} />}
			<Text style={[textStyles.h5, { color }]}>{label}</Text>
		</Pressable>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
	icon: { width: 28 },
})

export default MiniAppMenuRow
