import { StyleSheet, Text, View } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'

// UI
import QPPressable from '../../../../../ui/particles/QPPressable'

// Model
import type { ExchangeRouteSummary } from '../../exchangeView'

/**
 * La ruta en uso, siempre a la vista: "Ruta · SimpleSwap · Mejor tasa · 3 rutas ›".
 *
 * Va fuera de los detalles plegables a propósito: que haya varios proveedores compitiendo
 * por el cambio es lo que distingue esta pantalla, y escondido tras un desplegable nadie lo
 * descubriría. Con una sola ruta informa y no abre nada.
 */
const SwapRouteRow = ({ route, onPress }: { route: ExchangeRouteSummary, onPress: () => void }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const small = { fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.fontSize.sm }

	const body = (
		<View style={[styles.row, { backgroundColor: theme.colors.surface }, !theme.isDark && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}>
			<FontAwesome6 name="route" size={13} color={theme.colors.primary} iconStyle="solid" />
			<Text style={[small, { color: theme.colors.secondaryText }]}>{t('crypto.wallet.exchange.routes.label')}</Text>
			<View style={styles.texts}>
				<Text style={[small, styles.title, { color: theme.colors.primaryText, fontFamily: theme.typography.fontFamily.medium }]} numberOfLines={1}>{route.title}</Text>
				{!!route.caption && <Text style={[small, styles.caption, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{route.caption}</Text>}
			</View>
			{route.canChoose && <FontAwesome6 name="chevron-right" size={11} color={theme.colors.secondaryText} iconStyle="solid" />}
		</View>
	)

	if (!route.canChoose) { return body }

	return (
		<QPPressable variant="opacity" onPress={onPress} accessibilityRole="button" accessibilityLabel={route.a11yLabel}>
			{body}
		</QPPressable>
	)
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, borderCurve: 'continuous' },
	texts: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
	title: { flexShrink: 1 },
	caption: { flexShrink: 1 },
})

export default SwapRouteRow
