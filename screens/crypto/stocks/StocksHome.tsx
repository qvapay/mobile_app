import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import FontAwesome6 from '@react-native-vector-icons/fontawesome6'

import { useTheme } from '../../../theme/ThemeContext'
import { useContainerStyles } from '../../../theme/themeUtils'
import { ROUTES } from '../../../routes'
import QPBalance from '../../../ui/particles/QPBalance'
import QPSkeleton from '../../../ui/particles/QPSkeleton'
import QPPressable from '../../../ui/particles/QPPressable'
import { ChangeLine, RegionNotice, RiskSheet, StockRow } from './components/StockParts'
import { useXStockPortfolio, useXStocksAvailability } from './xstocksQueries'
import { sortByLiquidity } from './xstocksModel'

import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../../types/navigation'

type Props = NativeStackScreenProps<RootStackParamList, 'StocksHome'>

/**
 * Acciones tokenizadas (xStocks) — portada estilo Robinhood: el valor de tus acciones en
 * grande con lo que han hecho hoy, tus posiciones y las populares. Todo de la wallet
 * non-custodial: sin cuenta, sin KYC. Fuera de región (la decide qpweb por IP) la sección se
 * explica y no se ofrece.
 */
const StocksHome = ({ navigation }: Props) => {

	const { t } = useTranslation()
	const { theme } = useTheme()
	const containerStyles = useContainerStyles(theme)

	const { available, isLoading: availabilityLoading } = useXStocksAvailability()
	const { positions, summary, isLoading, refetch } = useXStockPortfolio()
	const popular = useMemo(() => sortByLiquidity(positions.filter(p => p.raw === 0n)), [positions])
	const [riskOpen, setRiskOpen] = useState(false)

	// `refreshing` solo por el tirón del usuario (convención de la app)
	const [refreshing, setRefreshing] = useState(false)
	const onRefresh = useCallback(async () => {
		setRefreshing(true)
		try { await refetch() } finally { setRefreshing(false) }
	}, [refetch])

	const openStock = useCallback((mint: string) => navigation.navigate(ROUTES.XSTOCK_DETAIL, { mint }), [navigation])

	const hasPositions = summary.held.length > 0

	return (
		<View style={containerStyles.subContainer}>
			<ScrollView
				contentContainerStyle={styles.content}
				showsVerticalScrollIndicator={false}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
			>
				{/* Fuera de región se ve todo, pero comprar y vender quedan deshabilitados en el detalle */}
				{!availabilityLoading && !available && <RegionNotice theme={theme} />}

				{/* Héroe: el valor de tus acciones, o la invitación si aún no tienes */}
				<View style={styles.hero}>
					<Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.medium }}>
						{t('crypto.xstocks.home.investing')}
					</Text>
					<QPBalance amount={summary.value} fontSize={theme.typography.fontSize.display} theme={theme} />
					{hasPositions
						? <ChangeLine amount={summary.dayChange} pct={summary.dayChangePct} label={t('crypto.xstocks.today')} theme={theme} />
						: <Text style={{ color: theme.colors.secondaryText, fontSize: theme.typography.fontSize.sm, fontFamily: theme.typography.fontFamily.regular }}>{t('crypto.xstocks.home.emptyHint')}</Text>}
				</View>

				{hasPositions && (
					<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
						<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>{t('crypto.xstocks.home.yourStocks')}</Text>
						{summary.held.map((position, index) => (
							<StockRow key={position.stock.mint} position={position} theme={theme} showShares isLast={index === summary.held.length - 1} onPress={() => openStock(position.stock.mint)} />
						))}
					</View>
				)}

				<View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
					<Text style={[styles.sectionTitle, { color: theme.colors.primaryText, fontSize: theme.typography.fontSize.md, fontFamily: theme.typography.fontFamily.semiBold }]}>
						{hasPositions ? t('crypto.xstocks.home.more') : t('crypto.xstocks.home.popular')}
					</Text>
					{isLoading && !popular.some(p => p.quote) && [0, 1, 2, 3].map(i => <QPSkeleton key={i} width="100%" height={52} borderRadius={10} style={styles.skeleton} />)}
					{popular.map((position, index) => (
						<StockRow key={position.stock.mint} position={position} theme={theme} showShares={false} isLast={index === popular.length - 1} onPress={() => openStock(position.stock.mint)} />
					))}
				</View>

				{/* Qué son y quién los emite: siempre a la vista, no solo en la letra pequeña del detalle */}
				<QPPressable variant="opacity" onPress={() => setRiskOpen(true)} style={styles.disclosure}>
					<FontAwesome6 name="circle-info" size={12} color={theme.colors.tertiaryText} iconStyle="solid" />
					<Text style={[styles.disclosureText, { color: theme.colors.tertiaryText, fontSize: theme.typography.fontSize.xs, fontFamily: theme.typography.fontFamily.regular }]}>
						{t('crypto.xstocks.home.disclosure')}
					</Text>
				</QPPressable>
			</ScrollView>
			<RiskSheet visible={riskOpen} onClose={() => setRiskOpen(false)} theme={theme} />
		</View>
	)
}

const styles = StyleSheet.create({
	content: {
		paddingBottom: 48,
		gap: 14,
	},
	hero: {
		paddingTop: 8,
		paddingBottom: 6,
		gap: 4,
	},
	card: {
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 4,
	},
	sectionTitle: {
		marginBottom: 2,
	},
	skeleton: {
		marginVertical: 6,
	},
	disclosure: {
		flexDirection: 'row',
		gap: 8,
		paddingHorizontal: 4,
	},
	disclosureText: {
		flex: 1,
		lineHeight: 17,
	},
})

export default StocksHome
