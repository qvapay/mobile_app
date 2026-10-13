import { memo } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'
import { useTranslation } from 'react-i18next'

// Theme
import { useTheme } from '../../../../../theme/ThemeContext'
import { useTextStyles } from '../../../../../theme/themeUtils'

// UI
import QPSheet from '../../../../../ui/QPSheet'
import QPPressable from '../../../../../ui/particles/QPPressable'
import { SHEET_MAX_RATIO } from '../../../../../ui/sheetConfig'

// Model
import type { ExchangeRouteItem } from '../../exchangeView'

/** Lo que la hoja gasta por encima y por debajo de la lista: tirador, cabecera y nota. */
const CHROME_HEIGHT = 170

/**
 * Las rutas del intercambio, una por proveedor, estilo SafePal: lo que recibes con cada
 * una, cuánto menos que la mejor, el tiempo y la comisión de red. Ordenadas por el backend
 * por lo que recibe el usuario, que sin margen de QvaPay es el neto real.
 *
 * Son pocas (una por proveedor activo), así que basta un ScrollView con tope de alto: una
 * lista virtualizada aquí sería complejidad sin nada que virtualizar.
 */
const SwapRoutesSheet = ({ visible, items, onSelect, onClose }: {
	visible: boolean
	items: ExchangeRouteItem[]
	onSelect: (provider: string) => void
	onClose: () => void
}) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)
	const { height } = useWindowDimensions()

	const pick = (provider: string) => { onSelect(provider); onClose() }

	return (
		<QPSheet visible={visible} title={t('crypto.wallet.exchange.routes.title')} onClose={onClose}>
			<ScrollView style={{ maxHeight: Math.max(height * SHEET_MAX_RATIO - CHROME_HEIGHT, 200) }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
				{items.map(item => <RouteRow key={item.provider} item={item} onPick={pick} />)}
			</ScrollView>
			<Text style={[textStyles.h6, styles.footnote, { color: theme.colors.tertiaryText }]}>{t('crypto.wallet.exchange.routes.footnote')}</Text>
		</QPSheet>
	)
}

const RouteRow = memo(({ item, onPick }: { item: ExchangeRouteItem, onPick: (provider: string) => void }) => {

	const { theme } = useTheme()
	const textStyles = useTextStyles(theme)

	return (
		<QPPressable
			onPress={() => { if (!item.disabled) { onPick(item.provider) } }}
			disabled={item.disabled}
			style={[
				styles.row,
				item.disabled && styles.disabled,
				{ backgroundColor: item.selected ? theme.colors.primary + '14' : theme.colors.surface },
				item.selected && [styles.selected, { borderColor: theme.colors.primary }],
			]}
			accessibilityRole="button"
			accessibilityState={{ selected: item.selected, disabled: item.disabled }}
			accessibilityLabel={`${item.label} ${item.receive}`}
		>
			<View style={styles.top}>
				<View style={styles.name}>
					<Text style={[textStyles.h4, { color: theme.colors.primaryText }]} numberOfLines={1}>{item.label}</Text>
					{item.badges.map(badge => (
						<View key={badge} style={[styles.badge, { backgroundColor: theme.colors.success + '26' }]}>
							<Text style={{ color: theme.colors.successText, fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.fontSize.xs }}>{badge}</Text>
						</View>
					))}
				</View>
				{!!item.receive && <Text style={[textStyles.h4, styles.receive, { color: theme.colors.primaryText }]} numberOfLines={1}>{item.receive}</Text>}
			</View>

			<View style={styles.bottom}>
				<Text style={[textStyles.h6, styles.detail, { color: item.disabled ? theme.colors.warning : theme.colors.secondaryText }]} numberOfLines={1}>{item.detail}</Text>
				{!!item.delta && <Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{item.delta}</Text>}
			</View>

			{!!item.custody && (
				<View style={styles.custody}>
					<FontAwesome6 name="building-columns" size={10} color={theme.colors.tertiaryText} iconStyle="solid" />
					<Text style={[textStyles.h6, { color: theme.colors.tertiaryText }]} numberOfLines={1}>{item.custody}</Text>
				</View>
			)}
		</QPPressable>
	)
})

const styles = StyleSheet.create({
	list: { gap: 8, paddingBottom: 4 },
	row: { padding: 12, gap: 4, borderRadius: 16, borderCurve: 'continuous' },
	disabled: { opacity: 0.5 },
	selected: { borderWidth: 1 },
	top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
	name: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
	badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
	receive: { textAlign: 'right' },
	bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
	detail: { flexShrink: 1 },
	custody: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
	footnote: { textAlign: 'center', marginTop: 10, paddingHorizontal: 8 },
})

export default SwapRoutesSheet
