import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../theme/ThemeContext'

// UI
import QPPressable from './QPPressable'

/** Alto de la botonera bajo el héroe de saldo (Home, Savings, wallet). */
export const ACTION_ROW_HEIGHT = 56

export type ActionTileItem = {
	icon: FontAwesome6SolidIconName
	label: string
	onPress: () => void
	/** Atenuado (gate KYC, "próximamente"): sigue siendo tocable para explicar por qué. */
	dimmed?: boolean
}

/**
 * Tile de acción de la botonera: squircle 16 sobre `elevation`, icono 17
 * arriba y label xs debajo. Ocupa todo su contenedor (flex 1): el padre
 * decide la fila (estática en la wallet, animada con parallax en el Home).
 */
const QPActionTile = ({ icon, label, onPress, dimmed }: ActionTileItem) => {

	const { theme } = useTheme()
	const color = dimmed ? theme.colors.tertiaryText : theme.colors.primaryText

	return (
		<QPPressable onPress={onPress} style={[styles.tile, { backgroundColor: theme.colors.elevation }]} accessibilityRole="button" accessibilityLabel={label}>
			<FontAwesome6 name={icon} size={17} color={color} iconStyle="solid" />
			<Text style={{ color, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.medium }}>
				{label}
			</Text>
		</QPPressable>
	)
}

/** Fila estática de tiles (la del Home es animada y usa QPActionTile por dentro). */
export const QPActionTileRow = ({ actions }: { actions: ActionTileItem[] }) => (
	<View style={styles.row}>
		{actions.map(action => (
			<View key={action.label} style={styles.slot}>
				<QPActionTile {...action} />
			</View>
		))}
	</View>
)

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		gap: 10,
		height: ACTION_ROW_HEIGHT,
	},
	slot: {
		flex: 1,
	},
	tile: {
		flex: 1,
		borderRadius: 16,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 5,
	},
})

export default QPActionTile
