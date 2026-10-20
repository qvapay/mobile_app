import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'

import { useTheme } from '../../../../theme/ThemeContext'
import { ROUTES } from '../../../../routes'
import { RegionNotice, StockRow } from './StockParts'
import { useXStockPortfolio, useXStocksAvailability } from '../xstocksQueries'
import { sortByLiquidity } from '../xstocksModel'

/**
 * Entrada a las acciones en el modo wallet (sin sesión), que no tiene el tab Crypto: las más
 * líquidas y "Ver todas". Fuera de región no se pinta.
 */
const XStocksCard = ({ limit = 3 }: { limit?: number }) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const navigation = useNavigation()

	// Fuera de región la tarjeta también sale (con el aviso): se ve, pero no se compra ni vende
	const { available, isLoading: checkingRegion } = useXStocksAvailability()
	const { positions } = useXStockPortfolio()
	const top = useMemo(() => sortByLiquidity(positions).slice(0, limit), [positions, limit])

	if (top.length === 0) { return null }

	return (
		<View testID="xstocks-card" style={[styles.card, { backgroundColor: theme.colors.surface }, !theme.isDark && [styles.border, { borderColor: theme.colors.border }]]}>
			<Text style={{ color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }}>{t('crypto.xstocks.card.title')}</Text>
			{!available && !checkingRegion && <View style={styles.notice}><RegionNotice theme={theme} compact /></View>}
			{top.map((position, i) => (
				<StockRow
					key={position.stock.mint}
					position={position}
					theme={theme}
					showShares={false}
					isLast={i === top.length - 1}
					onPress={() => navigation.navigate(ROUTES.XSTOCK_DETAIL, { mint: position.stock.mint })}
				/>
			))}
			<Pressable onPress={() => navigation.navigate(ROUTES.STOCKS_HOME)} style={styles.seeAll} hitSlop={6} accessibilityRole="button">
				<Text style={{ color: theme.colors.primary, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.semiBold }}>{t('crypto.xstocks.seeAll')}</Text>
			</Pressable>
		</View>
	)
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 8,
	},
	border: {
		borderWidth: 1,
	},
	notice: {
		marginTop: 8,
	},
	seeAll: {
		alignItems: 'center',
		paddingTop: 10,
		paddingBottom: 4,
	},
})

export default XStocksCard
