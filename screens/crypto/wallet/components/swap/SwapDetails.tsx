import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'

// UI
import QPPressable from '../../../../../ui/particles/QPPressable'

export type SwapDetailRow = { key: string, label: string, value: string, highlight?: boolean }

type Props = {
	/** Línea siempre visible: la tasa ("1 QUSD = 1 USD"). */
	rate: string
	/** Píldora junto a la tasa ("Sin comisión"). */
	badge?: string
	rows: SwapDetailRow[]
	/** Abierto de inicio (la hoja de revisión lo enseña todo). */
	expanded?: boolean
	collapsible?: boolean
}

/**
 * Tasa + detalles del swap: comisión, comisión de red, destino, tiempo, límite. Plegable en
 * el formulario (como el "1 ETH = … ▾" de Uniswap) y abierto en la revisión.
 */
const SwapDetails = ({ rate, badge, rows, expanded = false, collapsible = true }: Props) => {

	const { theme } = useTheme()
	const [open, setOpen] = useState(expanded)
	const small = { fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }

	const header = (
		<View style={styles.header}>
			<FontAwesome6 name="circle-info" size={13} color={theme.colors.tertiaryText} iconStyle="solid" />
			<Text style={[small, styles.rate, { color: theme.colors.primaryText }]}>{rate}</Text>
			{!!badge && (
				<View style={[styles.badge, { backgroundColor: theme.colors.success + '26' }]}>
					<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.fontSize.xs }}>{badge}</Text>
				</View>
			)}
			{collapsible && <FontAwesome6 name={open ? 'chevron-up' : 'chevron-down'} size={11} color={theme.colors.secondaryText} iconStyle="solid" />}
		</View>
	)

	return (
		<View style={styles.container}>
			{collapsible
				? <QPPressable variant="opacity" onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>{header}</QPPressable>
				: header}
			{(open || !collapsible) && (
				<Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.rows}>
					{rows.map(row => (
						<View key={row.key} style={styles.row}>
							<Text style={[small, { color: theme.colors.secondaryText }]}>{row.label}</Text>
							<Text style={[small, styles.value, { color: row.highlight ? theme.colors.successText : theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>{row.value}</Text>
						</View>
					))}
				</Animated.View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 4 },
	header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
	rate: { flex: 1 },
	badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
	rows: { gap: 10, paddingTop: 4, paddingBottom: 6 },
	row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
	value: { flexShrink: 1, textAlign: 'right' },
})

export default SwapDetails
