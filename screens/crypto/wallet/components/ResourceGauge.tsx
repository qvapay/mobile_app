import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import type { FontAwesome6SolidIconName } from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../theme/themeUtils'

type Props = {
	label: string
	icon: FontAwesome6SolidIconName
	/** Disponible ahora mismo. */
	available: bigint
	/** Total de la bolsa. 0 = la cuenta no tiene nada de este recurso. */
	total: bigint
	/** Texto bajo la barra, del tipo "de 600". */
	totalLabel: string
	tint: string
}

/**
 * Medidor de un recurso de la cuenta TRON. La barra mide lo DISPONIBLE sobre
 * el total, que es la lectura útil: lo que importa antes de firmar no es
 * cuánta energía tienes asignada sino cuánta te queda sin gastar hoy.
 */
const ResourceGauge = ({ label, icon, available, total, totalLabel, tint }: Props) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	const ratio = total > 0n ? Number(available) / Number(total) : 0
	const width = `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%` as const

	return (
		<View style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<View style={styles.head}>
				<FontAwesome6 name={icon} size={13} color={tint} iconStyle="solid" />
				<Text style={[textStyles.caption, { color: theme.colors.secondaryText }]}>{label}</Text>
			</View>
			<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{available.toLocaleString()}</Text>
			<Text style={[textStyles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{totalLabel}</Text>
			<View style={[styles.track, { backgroundColor: theme.colors.elevation }]}>
				<View style={[styles.fill, { width, backgroundColor: tint }]} />
			</View>
		</View>
	)
}

const styles = StyleSheet.create({
	card: { flex: 1, borderRadius: 14, borderCurve: 'continuous', padding: 14, gap: 4 },
	head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
	fill: { height: 5, borderRadius: 3 },
})

export default ResourceGauge
